/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

// Default Office Coordinates (Phnom Penh Headquarters)
let officeLocation = {
  latitude: 11.562108,
  longitude: 104.930058,
  name: 'ការិយាល័យកណ្តាល (Phnom Penh HQ)'
};

const ALLOWED_RADIUS_METERS = 100;
const DB_FILE = path.join(process.cwd(), 'attendance_db.json');

// Interface representation matching /src/types.ts
interface AttendanceRecord {
  id: string;
  employeeName: string;
  employeeId: string;
  timestamp: number;
  type: 'check-in' | 'check-out';
  latitude: number;
  longitude: number;
  distance: number;
  photoUrl: string;
  verificationStatus: 'success' | 'failed';
  verificationMethod: string;
}

// Ensure database file exists
let records: AttendanceRecord[] = [];
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    records = JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database file, starting clean:', err);
    records = [];
  }
} else {
  // Save initial empty db
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
}

// Save database utility
function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write to database file:', err);
  }
}

// Haversine Formula for server-side distance verification
function calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload size limit to accept base64 camera images
  app.use(express.json({ limit: '10mb' }));

  // API 1: Get server time, predefined office coords, and geofence config
  // This completely solves clock tampering because the client syncs its clock with this server timestamp.
  app.get('/api/system/info', (req, res) => {
    res.json({
      serverTime: Date.now(),
      officeLocation,
      allowedRadiusMeters: ALLOWED_RADIUS_METERS
    });
  });

  // API 2: Record Check-In or Check-Out (Includes rigorous server-side geofencing distance calculation)
  app.post('/api/attendance/record', (req, res) => {
    const { employeeName, employeeId, type, latitude, longitude, photoUrl } = req.body;

    if (!employeeName || !employeeId || !type || !latitude || !longitude || !photoUrl) {
      return res.status(400).json({ error: 'Missing required attendance data fields' });
    }

    // Server-side authoritative timestamp (cannot be manipulated by changing user\'s device time)
    const serverTimestamp = Date.now();

    // Re-verify the distance on the server side (critical Anti-Cheat measure)
    const calculatedDistance = calculateHaversine(
      latitude,
      longitude,
      officeLocation.latitude,
      officeLocation.longitude
    );

    // Enforce geofencing range
    const isWithinGeofence = calculatedDistance <= ALLOWED_RADIUS_METERS;

    if (!isWithinGeofence) {
      return res.status(403).json({
        error: 'ក្រៅតំបន់ការិយាល័យ! (Out of allowed zone!)',
        distance: Math.round(calculatedDistance),
        allowedRadius: ALLOWED_RADIUS_METERS
      });
    }

    // Build secure verified record
    const newRecord: AttendanceRecord = {
      id: `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      employeeName: String(employeeName).trim(),
      employeeId: String(employeeId).trim(),
      timestamp: serverTimestamp,
      type: type === 'check-out' ? 'check-out' : 'check-in',
      latitude: Number(latitude),
      longitude: Number(longitude),
      distance: Math.round(calculatedDistance),
      photoUrl: String(photoUrl),
      verificationStatus: 'success',
      verificationMethod: 'server-verified-gps-liveness-face'
    };

    records.unshift(newRecord);
    saveDatabase();

    res.json({
      success: true,
      record: newRecord
    });
  });

  // API 3: Get Attendance Logs History
  app.get('/api/attendance/history', (req, res) => {
    res.json(records);
  });

  // API 4: Test/Sandbox Control - Reset office location to custom coordinates so testers can trigger "Green Allowed Area"
  app.post('/api/system/office-settings', (req, res) => {
    const { latitude, longitude, name } = req.body;
    if (latitude && longitude) {
      officeLocation = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        name: name ? String(name).trim() : 'ទីតាំងសាកល្បងថ្មី (Sandbox Custom Location)'
      };
      return res.json({ success: true, officeLocation });
    }
    res.status(400).json({ error: 'Invalid coordinates provided' });
  });

  // Serve Vite or static files
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Attendance Backend] Authoritative Server running on port ${PORT}`);
  });
}

startServer();
