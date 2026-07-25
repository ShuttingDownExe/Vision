import React, { useRef, useState, useEffect } from 'react';
import { Camera, AlertTriangle, ShieldAlert, ListOrdered, Settings2 } from 'lucide-react';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [detections, setDetections] = useState([]);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [hazardLog, setHazardLog] = useState([]);
  
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  
  const inputRef = useRef(null);
  const [activeLabels, setActiveLabels] = useState(["cigarette", "lighter", "flame", "sparks", "knife", "firearm", "spilled liquid", "unauthorized person"]);
  const [updateStatus, setUpdateStatus] = useState("Update Watchlist");

  const [threshold, setThreshold] = useState(0.15);
  const thresholdRef = useRef(0.15);

  const isDetectingRef = useRef(false);
  const lastLogTimeRef = useRef(0);

  // Set up WebSocket to Python Backend
  useEffect(() => {
    let reconnectTimer;
    
    const connect = () => {
      console.log("Attempting to connect to Python backend...");
      wsRef.current = new WebSocket('ws://localhost:8000/ws');
      
      wsRef.current.onopen = () => {
        console.log("Connected to Python backend!");
        setIsModelLoading(false);
      };
      
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.predictions) {
          handlePredictions(data.predictions);
        } else if (data.error) {
          console.error("Backend Error:", data.error);
        }
        isDetectingRef.current = false; // Unlock for next frame
      };
      
      wsRef.current.onclose = () => {
        console.log("Disconnected from backend. Retrying in 3s...");
        setIsModelLoading(true);
        reconnectTimer = setTimeout(connect, 3000);
      };
      
      wsRef.current.onerror = (err) => {
        console.error("WebSocket error", err);
        if (wsRef.current) wsRef.current.close();
      };
    };
    
    connect();
    
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
          wsRef.current.onclose = null; // Prevent reconnect loop on unmount
          wsRef.current.close();
      }
    };
  }, []);

  const handlePredictions = (predictions) => {
    if (!canvasRef.current) return;
    
    setDetections(predictions);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    predictions.forEach(prediction => {
      const x = prediction.box.xmin;
      const y = prediction.box.ymin;
      const width = prediction.box.xmax - prediction.box.xmin;
      const height = prediction.box.ymax - prediction.box.ymin;
      
      const text = `HAZARD: ${prediction.label.toUpperCase()} (${Math.round(prediction.score * 100)}%)`;
      const color = '#ef4444'; 
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = color;
      const textWidth = ctx.measureText(text).width;
      const textHeight = parseInt(ctx.font, 10) || 16;
      ctx.fillRect(x, y - textHeight - 8, textWidth + 16, textHeight + 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.fillText(text, x + 8, y - 8);
    });
    
    const now = Date.now();
    if (now - lastLogTimeRef.current > 2000 && predictions.length > 0) {
       const topHazard = predictions[0];
       setHazardLog(prev => {
           if (prev.length > 0 && prev[0].label === topHazard.label) return prev;
           const newEntry = { time: new Date().toLocaleTimeString(), label: topHazard.label, score: topHazard.score };
           return [newEntry, ...prev].slice(0, 50);
       });
       lastLogTimeRef.current = now;
    }
  };

  // Set up camera
  useEffect(() => {
    let currentStream = null;

    const setupCamera = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const constraints = selectedDeviceId 
            ? { video: { deviceId: { exact: selectedDeviceId } }, audio: false }
            : { video: { facingMode: 'environment' }, audio: false };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          currentStream = stream;

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }

          // Fetch devices after permission is granted to get their actual names
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter(device => device.kind === 'videoinput');
          setVideoDevices(videoInputs);

          if (!selectedDeviceId && videoInputs.length > 0) {
              const trackDeviceId = stream.getVideoTracks()[0]?.getSettings()?.deviceId;
              if (trackDeviceId) setSelectedDeviceId(trackDeviceId);
          }
        } catch (error) {
          console.error("Error accessing camera:", error);
        }
      }
    };
    setupCamera();

    return () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
    };
  }, [selectedDeviceId]);

  const onVideoLoadedData = () => {
    setIsCameraReady(true);
    if (canvasRef.current && videoRef.current) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
    }
  };

  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoRef.current.videoWidth;
    tempCanvas.height = videoRef.current.videoHeight;
    const ctx = tempCanvas.getContext('2d');
    
    ctx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(canvasRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
    
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
    setSnapshots(prev => [dataUrl, ...prev]);
  };

  // Run detection loop continuously! (Sends to Python backend)
  useEffect(() => {
    let animationFrameId;

    const loop = () => {
      if (!isModelLoading && isCameraReady && !isDetectingRef.current && activeLabels.length > 0 && videoRef.current) {
        const video = videoRef.current;
        if (video.readyState === 4 && video.videoWidth > 0 && video.videoHeight > 0) {
            
          const MAX_WIDTH = 640;
          let width = video.videoWidth;
          let height = video.videoHeight;
          if (width > MAX_WIDTH) {
              height = Math.round(height * (MAX_WIDTH / width));
              width = MAX_WIDTH;
          }
            
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = width;
          tempCanvas.height = height;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(video, 0, 0, width, height);
          const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.6);
          
          const scaleX = video.videoWidth / width;
          const scaleY = video.videoHeight / height;
          
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              isDetectingRef.current = true; // Synchronously lock
              wsRef.current.send(JSON.stringify({
                  image: dataUrl,
                  labels: activeLabels,
                  threshold: thresholdRef.current,
                  scaleX: scaleX,
                  scaleY: scaleY
              }));
          }
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isModelLoading, isCameraReady, activeLabels]);

  const updateLabels = (e) => {
    e.preventDefault();
    if (!inputRef.current) return;
    const newLabels = inputRef.current.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (newLabels.length > 0) {
      setActiveLabels(newLabels);
      setUpdateStatus("Updated!");
      setTimeout(() => setUpdateStatus("Update Watchlist"), 2000);
    }
  };

  const handleThresholdChange = (e) => {
    const val = parseFloat(e.target.value);
    setThreshold(val);
    thresholdRef.current = val;
  };

  return (
    <div className="app-container">
      <header className="header" style={{flexDirection: 'column', alignItems: 'stretch', gap: '1rem'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div className="header-title">
            <ShieldAlert size={28} color="#ef4444" />
            <h1>Hazard Detection PoC <span style={{fontSize: '14px', background: 'rgba(239, 68, 68, 0.2)', padding: '2px 8px', borderRadius: '12px'}}>PRO (YOLO-World)</span></h1>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {videoDevices.length > 1 && (
              <select 
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem', outline: 'none', cursor: 'pointer' }}
              >
                {videoDevices.map((device, idx) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            )}
            <div className={`status-badge ${isModelLoading ? 'loading' : ''}`} style={{borderColor: isCameraReady && !isModelLoading ? 'rgba(239, 68, 68, 0.2)' : undefined, background: isCameraReady && !isModelLoading ? 'rgba(239, 68, 68, 0.1)' : undefined, color: isCameraReady && !isModelLoading ? '#ef4444' : undefined}}>
              <div className={`status-dot ${isModelLoading || !isCameraReady ? 'pulsing' : ''}`}></div>
              {isModelLoading ? 'Connecting to YOLO-World...' : isCameraReady ? 'Threat Scanning Active' : 'Initializing...'}
            </div>
          </div>
        </div>
        
        {/* Dynamic Watchlist Input */}
        <form onSubmit={updateLabels} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Settings2 size={20} color="#94a3b8" />
            <div style={{flex: 1}}>
              <label style={{display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Threat Watchlist (Comma Separated)</label>
              <input 
                type="text" 
                ref={inputRef}
                defaultValue="cigarette, lighter, flame, sparks, knife, firearm, spilled liquid, unauthorized person"
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.95rem', outline: 'none' }}
                placeholder="e.g. cigarette, lighter, bottle"
              />
            </div>
            <button type="submit" style={{ background: updateStatus === "Updated!" ? '#10b981' : '#ef4444', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontWeight: 600, transition: 'background 0.3s ease', height: '40px' }}>{updateStatus}</button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.75rem' }}>
             <label style={{ fontSize: '0.85rem', color: '#94a3b8', minWidth: '160px' }}>
                AI Sensitivity: {Math.round(threshold * 100)}%
             </label>
             <input 
               type="range" 
               min="0.02" 
               max="0.4" 
               step="0.01" 
               value={threshold} 
               onChange={handleThresholdChange}
               style={{ flex: 1, cursor: 'pointer', accentColor: '#ef4444' }}
             />
             <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Higher = Less False Alarms</span>
          </div>
        </form>
      </header>

      <main className="main-content" style={{paddingTop: '1rem'}}>
        <div className="camera-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedData={onVideoLoadedData}
            className="video-element"
          />
          <canvas ref={canvasRef} className="canvas-element" />
          
          {(isModelLoading || !isCameraReady) && (
            <div className="loading-overlay">
              <div className="spinner" style={{borderLeftColor: '#ef4444'}}></div>
              <p>Waking up Neural Network...</p>
              <p style={{fontSize: '0.8rem', opacity: 0.7}}>(Connecting to Python Backend)</p>
            </div>
          )}

          {isCameraReady && !isModelLoading && (
            <button className="capture-btn" style={{background: '#ef4444', boxShadow: '0 10px 25px rgba(239, 68, 68, 0.5)'}} onClick={captureSnapshot}>
              <Camera size={24} />
              Log Incident
            </button>
          )}
        </div>

        {isCameraReady && !isModelLoading && (
          <aside className="detections-panel">
            <div className="detections-section">
              <h2 style={{color: '#ef4444'}}>Active Threats</h2>
              {detections.length === 0 ? (
                <div style={{ color: '#10b981', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>
                  <ShieldAlert size={32} style={{ opacity: 0.8, margin: '0 auto 1rem', color: '#10b981' }} />
                  Area Secure.<br/>No threats detected.
                </div>
              ) : (
                detections.slice(0, 3).map((det, i) => (
                  <div key={i} className="detection-item" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
                    <span className="detection-name" style={{fontSize: '1rem', color: '#ef4444', textTransform: 'capitalize'}}>{det.label}</span>
                    <span className="detection-score" style={{color: '#ef4444'}}>{Math.round(det.score * 100)}%</span>
                  </div>
                ))
              )}
            </div>
            
            <div className="history-section">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={18} color="#f59e0b" /> Incident Log
              </h2>
              <div className="history-list">
                  {hazardLog.length === 0 ? (
                      <p className="empty-text" style={{ color: '#64748b', fontSize: '0.9rem', padding: '1rem 0' }}>No incidents logged.</p>
                  ) : (
                      hazardLog.map((log, i) => (
                          <div key={i} className="history-item">
                              <span className="history-time">{log.time}</span>
                              <span className="history-label" style={{color: '#f59e0b'}}>{log.label}</span>
                          </div>
                      ))
                  )}
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}

export default App;
