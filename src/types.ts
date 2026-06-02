/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Define standard types for the Khmer Attendance System
export interface OfficeCoords {
  latitude: number;
  longitude: number;
  name: string;
}

export type AttendanceType = 'check-in' | 'check-out';

export interface AttendanceRecord {
  id: string;
  employeeName: string;
  employeeId: string;
  timestamp: number; // Server timestamp representing exact authoritative time
  type: AttendanceType;
  latitude: number;
  longitude: number;
  distance: number; // Computed exact distance from office in meters
  photoUrl: string; // Base64 picture or snapshot URL
  verificationStatus: 'success' | 'failed';
  verificationMethod: string;
}

export interface SystemInfo {
  serverTime: number;
  officeLocation: OfficeCoords;
  allowedRadiusMeters: number;
}
