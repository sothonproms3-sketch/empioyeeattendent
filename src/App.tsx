/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import {
  Clock,
  MapPin,
  Camera,
  ShieldCheck,
  ShieldAlert,
  User,
  CheckCircle2,
  AlertCircle,
  History,
  Smartphone,
  Building,
  RefreshCw,
  Sliders,
  LogOut,
  LogIn,
  Check
} from 'lucide-react';
import { animate, motion } from 'motion/react';
import { calculateDistance, formatKhmerDate, formatKhmerTime } from './utils';
import { OfficeCoords, AttendanceRecord, SystemInfo, AttendanceType } from './types';

export default function App() {
  // Navigation tabs: 'scan' | 'history' | 'settings'
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');

  // Employee configurations (default, but fully editable by user to test custom profiles)
  const [empName, setEmpName] = useState<string>('សុខ ជា');
  const [empId, setEmpId] = useState<string>('EMP-9082');
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);

  // System parameters (synced with our Express server)
  const [officeLocation, setOfficeLocation] = useState<OfficeCoords>({
    latitude: 11.562108,
    longitude: 104.930058,
    name: 'ការិយាល័យកណ្តាល (Phnom Penh HQ)'
  });
  const [allowedRadius, setAllowedRadius] = useState<number>(100);
  const [serverOffset, setServerOffset] = useState<number>(0); // Store difference between server time and local device clock

  // Dynamic user states
  const [currentCoords, setCurrentCoords] = useState<GeolocationCoordinates | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(true);
  const [distanceText, setDistanceText] = useState<string>('កំពុងគណនា...');
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [isWithinGeofence, setIsWithinGeofence] = useState<boolean>(false);

  // Camera states
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

  // Time & Logging
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [submitLoading, setSubmitLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch initial configuration and sync clock
  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('/api/system/info');
      if (response.ok) {
        const data: SystemInfo = await response.json();
        setOfficeLocation(data.officeLocation);
        setAllowedRadius(data.allowedRadiusMeters);
        // Calculate offset to void any local clock manipulations (Anti-Cheat check)
        const offset = data.serverTime - Date.now();
        setServerOffset(offset);
      }
    } catch (err) {
      console.error('Failed to contact backend API server info:', err);
    }
  };

  // Fetch history from database
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/attendance/history');
      if (response.ok) {
        const data: AttendanceRecord[] = await response.json();
        setHistoryRecords(data);
      }
    } catch (err) {
      console.error('Failed to get history logs:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Run synchronization on mount and periodically
  useEffect(() => {
    fetchSystemInfo();
    fetchHistory();

    const clockInterval = setInterval(() => {
      // Current synchronized clock is updated dynamically via offset
      setCurrentTime(Date.now() + serverOffset);
    }, 1000);

    return () => clearInterval(clockInterval);
  }, [serverOffset]);

  // Track coordinates in real-time
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('ប្រព័ន្ធស្វែងរកទីតាំង (GPS) មិនត្រូវបានគាំទ្រលើឧបករណ៍នេះឡើយ');
      setGpsLoading(false);
      return;
    }

    setGpsLoading(true);
    // watchPosition will dynamically listen for location updates (crucial Anti-Cheat, detects real active GPS transit)
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentCoords(position.coords);
        setGpsError(null);
        setGpsLoading(false);

        // Compute distance from active coordinates to configured office headquarters
        const dist = calculateDistance(
          position.coords.latitude,
          position.coords.longitude,
          officeLocation.latitude,
          officeLocation.longitude
        );

        setDistanceMeters(dist);
        setIsWithinGeofence(dist <= allowedRadius);
        setDistanceText(`${Math.round(dist)} ម៉ែត្រ`);
      },
      (err) => {
        console.error('GPS tracking error:', err);
        setGpsLoading(false);
        if (err.code === 1) {
          setGpsError('សូមអនុញ្ញាតសិទ្ធិចូលប្រើទីតាំង (GPS Permission) ដើម្បីបន្តការប្រើប្រាស់');
        } else {
          setGpsError('មិនអាចស្វែងរកទីតាំងរបស់អ្នកបានទេ សូមបើក GPS លើទូរសព្ទរបស់អ្នក');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [officeLocation, allowedRadius]);

  // Camera Management (Launch / Shutdown stream)
  const startCamera = async () => {
    setCapturedPhoto(null);
    setCameraError(null);
    setIsCameraActive(true);

    try {
      // Hard constraints: User front facing camera only, preventing external gallery uploads
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user', // Enforce selfie camera
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera stream initiation failure:', err);
      setIsCameraActive(false);
      setCameraError('មិនអាចបើកកាមេរ៉ាខាងមុខបានឡើយ សូមអនុញ្ញាតសិទ្ធិប្រើប្រាស់កាមេរ៉ា!');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    setCameraStream(null);
    setIsCameraActive(false);
  };

  // Capture face snapshot from video feed and draw to Canvas (Anti-Cheat check: no input[file] gallery access is permitted)
  const captureSnapshot = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const context = canvas.getContext('2d');
      if (context) {
        // Draw the current video frame on-canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas image into high-resolution compressed base64 jpeg URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedPhoto(dataUrl);
        stopCamera();
      }
    }
  };

  // Submit secure record to Backend (server recalculates distance & applies server-side timestamps)
  const submitAttendance = async (type: AttendanceType) => {
    if (!currentCoords) {
      setFeedback({ type: 'error', message: 'សូមរង់ចាំរហូតដល់ប្រព័ន្ធទាញយកទីតាំង GPS បានជោគជ័យ' });
      return;
    }

    if (!capturedPhoto) {
      setFeedback({ type: 'error', message: 'សូមធ្វើការស្កេនផ្ទៃមុខ (Capture Photo) ជាមុនសិន' });
      return;
    }

    setSubmitLoading(true);
    setFeedback(null);

    const payload = {
      employeeName: empName,
      employeeId: empId,
      type,
      latitude: currentCoords.latitude,
      longitude: currentCoords.longitude,
      photoUrl: capturedPhoto
    };

    try {
      const response = await fetch('/api/attendance/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setFeedback({
          type: 'success',
          message: `ការកត់ត្រា${type === 'check-in' ? 'ចូល' : 'ចេញ'}ការងារបានសម្រេចដោយជោគជ័យ!`
        });
        setCapturedPhoto(null);
        fetchHistory(); // Reload historical log list
        // Automatically switch to history tab shortly to see logs
        setTimeout(() => {
          setActiveTab('history');
          setFeedback(null);
        }, 1500);
      } else {
        setFeedback({ type: 'error', message: result.error || 'ការកត់ត្រាវត្តមានបានបរាជ័យ!' });
      }
    } catch (err) {
      console.error('Attendance submit error:', err);
      setFeedback({ type: 'error', message: 'បញ្ហាភ្ជាប់ទៅកាន់ម៉ាស៊ីនមេ! សូមព្យាយាមម្តងទៀត។' });
    } finally {
      setSubmitLoading(false);
    }
  };

  // Tester Sandbox tool: Reconfigure the office coordinates to the user's active geographic location
  const setOfficeToCurrentLocation = async () => {
    if (!currentCoords) return;
    try {
      const response = await fetch('/api/system/office-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: currentCoords.latitude,
          longitude: currentCoords.longitude,
          name: 'ទីតាំងសាកល្បងជិតបំផុត (Sandbox Nearby Coords)'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setOfficeLocation(data.officeLocation);
        setFeedback({
          type: 'success',
          message: 'ទីតាំងការិយាល័យការងារត្រូវបានកំណត់មកកាន់ទីតាំងបច្ចុប្បន�  return (
    <div className="min-h-screen bg-[#050505] flex flex-col font-sans text-slate-200">
      {/* Container holding both presentation framework & mobile display frame */}
      <div className="max-w-md w-full mx-auto bg-[#0a0a0a] min-h-screen border-x border-white/10 flex flex-col relative overflow-hidden shadow-2xl shadow-indigo-950/15">
        
        {/* Sleek App Top Header Bar */}
        <header className="bg-[#050505] text-white px-5 py-5 flex flex-col border-b border-white/10 shadow-lg relative z-20">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]">
                <ShieldCheck size={18} className="animate-pulse" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-sm font-semibold tracking-wide text-white font-sans">
                  ប្រព័ន្ធវត្តមានស្អាតស្អំ
                </h1>
                <span className="text-[10px] text-indigo-400 font-mono tracking-widest font-semibold uppercase">ANTI-CHEAT ATTENDANCE</span>
              </div>
            </div>

            {/* Micro Indicator showing server connectivity status */}
            <div className="flex items-center gap-1.5 bg-indigo-950/40 border border-indigo-500/30 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping"></span>
              <span className="text-[9px] font-mono font-bold text-indigo-400">SERVER SECURE</span>
            </div>
          </div>

          {/* Synchronized Unified Clock with zero client tampering potential */}
          <div className="mt-5 flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-medium">{formatKhmerDate(currentTime)}</span>
              <div className="flex items-center gap-2 mt-1">
                <Clock size={16} className="text-indigo-400" />
                <span className="text-2xl font-bold font-mono tracking-wider text-white">
                  {formatKhmerTime(currentTime)}
                </span>
              </div>
            </div>
            
            {/* Quick Refresh action */}
            <button
              onClick={() => { fetchSystemInfo(); fetchHistory(); }}
              className="p-2 bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Sync time and history"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        {/* Main Interface Content Flow based on active navigation tab */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 relative z-10">
          
          {/* Quick User Identity Config Section */}
          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <User size={18} />
                </div>
                <div>
                  {isEditingProfile ? (
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="text"
                        value={empName}
                        onChange={(e) => setEmpName(e.target.value)}
                        className="text-xs font-semibold text-white border border-white/10 px-2 py-1 rounded bg-[#181818] focus:outline-none focus:border-indigo-500"
                        placeholder="ឈ្មោះបុគ្គលិក"
                      />
                      <input
                        type="text"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                        className="text-[10px] font-mono text-slate-400 border border-white/10 px-2 py-0.5 rounded bg-[#181818] focus:outline-none focus:border-indigo-500"
                        placeholder="អត្តលេខ"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">ស្វាគមន៍បុគ្គលិក</h2>
                      <h3 className="text-sm font-semibold text-white leading-tight">{empName}</h3>
                      <span className="text-[10px] font-mono text-indigo-400/80 mt-0.5 font-medium">ID: {empId}</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setIsEditingProfile(!isEditingProfile)}
                className="text-xs px-3 py-1.5 bg-[#181818] border border-white/10 rounded-xl hover:bg-[#222] hover:border-white/20 text-slate-300 font-medium transition cursor-pointer"
              >
                {isEditingProfile ? 'រក្សាទុក' : 'កែប្រែ'}
              </button>
            </div>
          </div>

          {/* Alert Notification Display area */}
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-2xl flex items-start gap-2.5 shadow-md text-xs ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-950/40 border border-rose-500/20 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              )}
              <p className="leading-relaxed">{feedback.message}</p>
            </motion.div>
          )}

          {activeTab === 'scan' && (
            <div className="space-y-4">
              
              {/* Geofencing Status Card (GPS Status validation indicator) */}
              <div className="bg-[#111111] border border-white/5 rounded-[2rem] p-5 shadow-sm flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={16} className="text-indigo-400" />
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">ស្ថានភាពឆ្លងកាត់ទីតាំង (GPS Check)</h3>
                  </div>
                  
                  {gpsLoading ? (
                    <span className="text-[10px] text-slate-400 bg-white/5 border border-white/5 px-2.5 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                      <RefreshCw size={8} className="animate-spin text-indigo-400" /> កំពុងស្វែងរក...
                    </span>
                  ) : gpsError ? (
                    <span className="text-[10px] text-rose-400 bg-rose-950/30 border border-rose-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                      <AlertCircle size={8} /> ទីតាំងបរាជ័យ
                    </span>
                  ) : isWithinGeofence ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 font-bold tracking-tight shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                      ក្នុងតំបន់អនុញ្ញាត
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-400 bg-rose-950/30 border border-rose-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 font-bold tracking-tight">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                      ក្រៅតំបន់អនុញ្ញាត
                    </span>
                  )}
                </div>

                {gpsError ? (
                  <div className="bg-rose-950/35 rounded-xl p-3 border border-rose-500/10 flex gap-2.5 items-center text-rose-300 text-xs text-balance">
                    <AlertCircle size={16} className="text-rose-400 shrink-0" />
                    <span>{gpsError}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div className="bg-[#181818] rounded-2xl p-3.5 border border-white/5 flex flex-col justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ចម្ងាយពីក្រុមហ៊ុន</span>
                      <span className={`text-lg font-extrabold font-mono tracking-tight mt-1 ${isWithinGeofence ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {distanceText}
                      </span>
                      <span className="text-[9px] text-slate-500 mt-1 select-none">(ត្រូវតិចជាង ១០០ ម៉ែត្រ)</span>
                    </div>

                    <div className="bg-[#181818] rounded-2xl p-3.5 border border-white/5 flex flex-col justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">កូអរដោនេចរន្ត</span>
                      {currentCoords ? (
                        <div className="flex flex-col font-mono text-[10px] font-semibold text-slate-300 mt-1.5 leading-relaxed">
                          <span className="truncate">Lat: {currentCoords.latitude.toFixed(6)}</span>
                          <span className="truncate">Lon: {currentCoords.longitude.toFixed(6)}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 mt-2">ស្វែងរក...</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Office Target Coordinates banner */}
                <div className="bg-[#181818] rounded-xl p-3 border border-white/5 flex items-center justify-between text-[11px] text-slate-300">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Building size={14} className="text-indigo-400 shrink-0" />
                    <span className="text-slate-300 truncate font-medium">គោលដៅ៖ {officeLocation.name}</span>
                  </div>
                  <span className="text-slate-500 font-mono text-[9px] shrink-0 ml-2">({officeLocation.latitude.toFixed(4)}, {officeLocation.longitude.toFixed(4)})</span>
                </div>
              </div>

              {/* Facial Scanner & Webcam capture area */}
              <div className="bg-[#111111] border border-white/5 rounded-[2rem] p-5 shadow-sm flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <Camera size={16} className="text-indigo-400" />
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">ការបញ្ជាក់ស្កេនផ្ទៃមុខ (Face Scan)</h3>
                  </div>

                  {capturedPhoto && (
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Check size={10} /> ថតរួចរាល់
                    </span>
                  )}
                </div>

                {cameraError && (
                  <div className="bg-rose-950/30 rounded-xl p-3 border border-rose-500/10 flex gap-2 items-center text-rose-300 text-xs">
                    <AlertCircle size={16} className="text-rose-400 shrink-0" />
                    <span>{cameraError}</span>
                  </div>
                )}

                {/* Interactive Viewport Box */}
                <div className="relative aspect-video w-full bg-[#000] rounded-2xl overflow-hidden border border-white/5 flex items-center justify-center shadow-inner group">
                  
                  {/* Option 1: Live active cam */}
                  {isCameraActive && !capturedPhoto ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover scale-x-[-1]" // mirror selfie mode
                      />
                      
                      {/* Bounding box guide animation */}
                      <div className="absolute inset-0 border-[2px] border-indigo-500/20 m-6 rounded-2xl pointer-events-none flex items-center justify-center">
                        <div className="w-36 h-36 rounded-full border border-dashed border-indigo-400/50 relative flex items-center justify-center">
                          {/* Face guidance scanline effect */}
                          <motion.div
                            className="absolute top-0 left-0 w-full h-0.5 bg-indigo-400 opacity-60 shadow-[0_0_12px_#6366f1]"
                            animate={{ top: ['0%', '100%', '0%'] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        </div>
                      </div>

                      {/* Display instruction overlays */}
                      <div className="absolute bottom-3 inset-x-4 text-center">
                        <span className="text-[10px] bg-slate-950/90 border border-white/10 px-3 py-1.5 text-indigo-400 font-semibold rounded-full backdrop-blur-xs select-none">
                          សូមរក្សាផ្ទៃមុខរបស់អ្នកឱ្យចំរង្វង់ផ្នែកកណ្តាល
                        </span>
                      </div>
                    </>
                  ) : capturedPhoto ? (
                    
                    /* Option 2: Show Captured Photo */
                    <div className="relative w-full h-full">
                      <img
                        src={capturedPhoto}
                        alt="Face scan preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      
                      {/* Scan verify overlay */}
                      <div className="absolute inset-0 bg-[#000]/60 flex items-center justify-center">
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="bg-[#0c0c0c] border border-indigo-500/30 px-4 py-3 rounded-2xl text-center text-white shadow-xl"
                        >
                          <ShieldCheck className="mx-auto text-indigo-400 mb-1" size={24} />
                          <span className="text-[10px] font-mono font-bold tracking-widest block text-indigo-400">SNAP VERIFIED</span>
                        </motion.div>
                      </div>
                    </div>
                  ) : (
                    
                    /* Option 3: Empty Default Slate */
                    <div className="text-center p-6 flex flex-col items-center select-none">
                      <div className="w-12 h-12 rounded-full bg-[#111] border border-white/10 flex items-center justify-center text-slate-500 mb-3">
                        <Camera size={20} />
                      </div>
                      <p className="text-xs text-slate-400 max-w-xs px-2 leading-relaxed">
                        តម្រូវឱ្យប្រើប្រាស់កាមេរ៉ាខាងមុខផ្ទាល់ ដើម្បីចាប់មុំបញ្ជាក់ផ្ទៃមុខបុគ្គលិក (Live Selfie Liveness Check)
                      </p>
                    </div>
                  )}
                </div>

                {/* Camera Trigger Buttons */}
                <div className="flex gap-2">
                  {!isCameraActive && !capturedPhoto ? (
                    <button
                      onClick={startCamera}
                      disabled={!isWithinGeofence}
                      className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-xs flex justify-center items-center gap-2 transition cursor-pointer disabled:opacity-40 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed shadow-[0_4px_15px_rgba(79,70,229,0.3)]"
                    >
                      <Camera size={14} /> Open Camera (បើកកាមេរ៉ា)
                    </button>
                  ) : isCameraActive ? (
                    <div className="flex-1 flex gap-2">
                      <button
                        onClick={captureSnapshot}
                        className="flex-3 py-3.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-2xl text-xs flex justify-center items-center gap-2 transition cursor-pointer shadow-[0_4px_15px_rgba(99,102,241,0.25)]"
                      >
                        Capture Snapshot (ស្កេនរូបថត)
                      </button>
                      <button
                        onClick={stopCamera}
                        className="flex-1 py-3.5 bg-[#181818] border border-white/5 hover:bg-[#222] text-slate-300 font-semibold rounded-2xl text-xs transition cursor-pointer"
                      >
                        បោះបង់
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={startCamera}
                      className="flex-1 py-3.5 bg-[#1a1a1a] hover:bg-[#222] text-slate-300 border border-white/10 rounded-2xl font-bold text-xs flex justify-center items-center gap-2 transition cursor-pointer"
                    >
                      <RefreshCw size={12} /> Re-Take (ថតរូបភាពឡើងវិញ)
                    </button>
                  )}
                </div>
              </div>

              {/* Action Trigger Attendance buttons (Check-In & Check-Out) */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <button
                  disabled={!isWithinGeofence || !capturedPhoto || submitLoading}
                  onClick={() => submitAttendance('check-in')}
                  className="py-4.5 rounded-[1.75rem] text-white font-bold text-sm bg-indigo-600 hover:bg-indigo-500 flex flex-col items-center justify-center gap-1.5 shadow-[0_8px_20px_rgba(79,70,229,0.35)] active:scale-98 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <LogIn size={20} />
                  <span>កត់ត្រាចូលការងារ</span>
                  <span className="text-[8px] uppercase tracking-widest font-mono text-indigo-200 italic select-none">CHECK-IN</span>
                </button>

                <button
                  disabled={!isWithinGeofence || !capturedPhoto || submitLoading}
                  onClick={() => submitAttendance('check-out')}
                  className="py-4.5 rounded-[1.75rem] text-slate-300 font-bold text-sm bg-[#111] hover:bg-[#181818] border border-white/10 flex flex-col items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <LogOut size={20} />
                  <span>កត់ត្រាចេញការងារ</span>
                  <span className="text-[8px] uppercase tracking-widest font-mono text-slate-400 italic select-none">CHECK-OUT</span>
                </button>
              </div>

              {/* Visual Warning when Out Of Zone */}
              {!isWithinGeofence && currentCoords && (
                <div className="bg-rose-950/20 border border-rose-500/20 rounded-[1.5rem] p-4 flex gap-3 text-rose-300 items-start shadow-inner">
                  <ShieldAlert className="text-rose-500 shrink-0 mt-0.5 animate-bounce" size={18} />
                  <div className="flex flex-col gap-1 text-[11px] leading-relaxed">
                    <h4 className="font-bold text-rose-400">ការព្រមាន៖ ប្រព័ន្ធការពារការកែបន្លំទីតាំង (Anti-Cheat Active)</h4>
                    <p className="text-rose-300/90">
                      អ្នកកំពុងស្ថិតនៅចម្ងាយ {Math.round(distanceMeters || 0)} ម៉ែត្រការិយាល័យ។ ប៊ូតុង Check-In/Check-Out ត្រូវបានបំរុងទុក និងផ្តាច់ជាបណ្តោះអាសន្នរហូតដល់អ្នកទៅជិតតំបន់ការិយាល័យ (ក្រោម ១០០ ម៉ែត្រ)។
                    </p>
                  </div>
                </div>
              )}

              {/* Sandbox Control Section for AI Studio testers */}
              <div className="bg-[#111] border border-white/5 rounded-[2rem] p-5 shadow-lg space-y-3.5">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2.5">
                  <Sliders size={15} className="text-indigo-400" />
                  <h3 className="text-xs font-bold font-sans text-slate-200 uppercase tracking-wider">ប្រអប់សាកល្បងវត្តមាន (Sandbox Settings)</h3>
                </div>

                <div className="text-[11px] text-slate-400 leading-normal">
                  <p>
                    ដោយសារប្រព័ន្ធនេះតម្រូវឱ្យទីតាំងរបស់អ្នកស្ថិតនៅក្នុងគម្លាតក្រោម ១០០ ម៉ែត្រពីការិយាល័យ HQ (Phnom Penh Royal Palace) អ្នកអាចចុចប៊ូតុងខាងក្រោមដើម្បីទាញយកទីតាំងបច្ចុប្បន្នរបស់អ្នក រួចផ្លាស់ប្តូរទីតាំងការិយាល័យក្នុងម៉ាស៊ីនមេមកទីនេះបានភ្លាមៗ!
                  </p>
                </div>

                <div className="flex gap-2 pt-1 font-sans">
                  <button
                    onClick={setOfficeToCurrentLocation}
                    disabled={!currentCoords}
                    className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-[10px] flex justify-center items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-[0_0_12px_rgba(79,70,229,0.2)]"
                  >
                    <MapPin size={11} /> កំណត់ការិយាល័យមកទីនេះ
                  </button>

                  <button
                    onClick={resetOfficeLocation}
                    className="py-2.5 px-3 bg-[#181818] hover:bg-[#222] text-slate-300 border border-white/5 rounded-xl font-semibold text-[10px] transition cursor-pointer"
                  >
                    កំណត់ទៅលំនាំដើម
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2">
                  <History size={16} className="text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">ប្រវត្តិវត្តមានរបស់អ្នក (My Logs History)</h3>
                </div>
                
                {/* Manual Reload List */}
                <button
                  onClick={fetchHistory}
                  disabled={historyLoading}
                  className="p-1 text-slate-500 hover:text-slate-300 transition"
                >
                  <RefreshCw size={13} className={historyLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {historyLoading ? (
                <div className="text-center py-10 flex flex-col items-center gap-2 select-none">
                  <RefreshCw size={24} className="animate-spin text-indigo-400" />
                  <span className="text-xs text-slate-400">កំពុងទាញយកប្រវត្តិកត់ត្រា...</span>
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="text-center py-12 bg-[#111] rounded-[2rem] border border-dashed border-white/10 text-slate-500 flex flex-col justify-center items-center p-6">
                  <History size={32} className="text-slate-600 mb-2" />
                  <span className="text-xs select-none">មិនទាន់មានប្រវត្តិវត្តមាននៅក្នុងគណនីរបស់អ្នកឡើយ</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="bg-[#111] border border-white/5 rounded-2xl p-3 shadow-sm hover:border-white/10 transition duration-200 flex gap-3 relative overflow-hidden"
                    >
                      {/* Photo preview snapshot */}
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-black shrink-0 border border-white/5 relative shadow-inner">
                        <img
                          src={rec.photoUrl}
                          alt="Face Verification Stamp"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* Attend Details info */}
                      <div className="flex-1 flex flex-col justify-between overflow-hidden">
                        <div className="flex justify-between items-start gap-1">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="text-xs font-bold text-slate-200 line-clamp-1">{rec.employeeName}</span>
                            <span className="text-[9px] font-mono font-semibold bg-white/5 text-slate-400 px-1 py-0.5 rounded shrink-0">ID: {rec.employeeId}</span>
                          </div>

                          {/* Status verification indicator badge */}
                          <div className={`p-1 text-white rounded-full ${rec.type === 'check-in' ? 'bg-indigo-600' : 'bg-[#1a1a1a] border border-white/10'}`} title={rec.type === 'check-in' ? 'Check In' : 'Check Out'}>
                            {rec.type === 'check-in' ? <LogIn size={10} /> : <LogOut size={10} />}
                          </div>
                        </div>

                        {/* Accurate dates with Server Time enforcement */}
                        <div className="text-[11px] text-slate-400 flex flex-col">
                          <span>{formatKhmerDate(rec.timestamp)}</span>
                          <span className="font-bold text-white font-mono tracking-wider mt-0.5">{formatKhmerTime(rec.timestamp)}</span>
                        </div>

                        {/* Location telemetry stamps */}
                        <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-1.5 text-[10px] text-slate-500 justify-between">
                          <span className="flex items-center gap-1 shrink-0 font-medium">
                            <MapPin size={9} className="text-indigo-400 shrink-0" />
                            ចម្ងាយ៖ {rec.distance} ម៉ែត្រ
                          </span>
                          
                          <span className="text-indigo-400 bg-indigo-500/10 font-bold px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-widest font-mono text-[8px] border border-indigo-500/10">
                            SECURE VERIFIED
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Global Bottom Navigation Bar */}
        <nav className="absolute bottom-0 inset-x-0 bg-[#050505] border-t border-white/10 px-6 py-4 flex justify-around shadow-2xl z-20">
          <button
            onClick={() => { setActiveTab('scan'); setFeedback(null); }}
            className={`flex flex-col items-center gap-1 select-none cursor-pointer transition-all ${
              activeTab === 'scan' ? 'text-indigo-400 font-bold scale-105' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Smartphone size={16} />
            <span className="text-[10px] font-medium tracking-wide">ស្កេនវត្តមាន</span>
          </button>

          <button
            onClick={() => { setActiveTab('history'); setFeedback(null); }}
            className={`flex flex-col items-center gap-1 select-none cursor-pointer transition-all ${
              activeTab === 'history' ? 'text-indigo-400 font-bold scale-105' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <History size={16} />
            <span className="text-[10px] font-medium tracking-wide">ប្រវត្តិវត្តមាន</span>
          </button>
        </nav>
      </div>
    </div>
  );e="text-xs font-bold text-slate-800 line-clamp-1">{rec.employeeName}</span>
                            <span className="text-4xs font-mono font-semibold bg-slate-100 text-slate-500 px-1 py-0.5 rounded shrink-0">{rec.employeeId}</span>
                          </div>

                          {/* Status verification indicator badge */}
                          <div className={`p-1 text-white rounded-full ${rec.type === 'check-in' ? 'bg-emerald-500' : 'bg-slate-700'}`} title={rec.type === 'check-in' ? 'Check In' : 'Check Out'}>
                            {rec.type === 'check-in' ? <LogIn size={11} /> : <LogOut size={11} />}
                          </div>
                        </div>

                        {/* Accurate dates with Server Time enforcement */}
                        <div className="text-3xs text-slate-500 flex flex-col">
                          <span>{formatKhmerDate(rec.timestamp)}</span>
                          <span className="font-semibold text-slate-700 font-mono tracking-wider mt-0.5">{formatKhmerTime(rec.timestamp)}</span>
                        </div>

                        {/* Location telemetry stamps */}
                        <div className="mt-1 flex items-center gap-2 border-t border-slate-100 pt-1 text-3xs text-slate-400 justify-between">
                          <span className="flex items-center gap-1 shrink-0">
                            <MapPin size={10} className="text-slate-400 shrink-0" />
                            ចម្ងាយ៖ {rec.distance} ម៉ែត្រ
                          </span>
                          
                          <span className="text-emerald-600 bg-emerald-50 font-bold px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-widest font-mono text-4xs">
                            SECURE VERIFIED
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Global Bottom Navigation Bar */}
        <nav className="absolute bottom-0 inset-x-0 bg-slate-900 border-t border-slate-800 px-6 py-3 flex justify-around shadow-2xl z-10">
          <button
            onClick={() => { setActiveTab('scan'); setFeedback(null); }}
            className={`flex flex-col items-center gap-1 select-none cursor-pointer ${
              activeTab === 'scan' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone size={18} />
            <span className="text-3xs font-medium">ស្កេនវត្តមាន</span>
          </button>

          <button
            onClick={() => { setActiveTab('history'); setFeedback(null); }}
            className={`flex flex-col items-center gap-1 select-none cursor-pointer ${
              activeTab === 'history' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History size={18} />
            <span className="text-3xs font-medium">ប្រវត្តិវត្តមាន</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
