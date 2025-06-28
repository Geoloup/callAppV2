/**
 * P2P Video Calling Application with Advanced Grid-based Motion Detection
 * Features: PeerJS integration, video streaming, grid motion detection, motion logging, camera controls
 */

class VideoCallApp {
  constructor() {
    // PeerJS and connection management
    this.peer = null;
    this.conn = null;
    this.call = null;
    this.localStream = null;
    this.remoteStream = null;
    
    // Camera and video controls
    this.availableCameras = [];
    this.currentCameraId = null;
    this.videoTransforms = {
      flipHorizontal: false,
      flipVertical: false,
      rotation: 0 // 0, 90, 180, 270
    };
    
    // Grid-based motion detection properties
    this.motionDetectionEnabled = false;
    this.motionCanvas = null;
    this.motionContext = null;
    this.gridOverlayCanvas = null;
    this.gridOverlayContext = null;
    this.remoteGridOverlayCanvas = null;
    this.remoteGridOverlayContext = null;
    this.previousFrame = null;
    this.motionThreshold = 0.02; // Reduced threshold for better sensitivity
    this.motionCheckInterval = null;
    this.animationFrameId = null;
    
    // Performance optimization
    this.lastMotionCheck = 0;
    this.motionCheckDelay = 50; // Check every 50ms instead of 100ms
    this.frameSkipCounter = 0;
    this.frameSkipRate = 1; // Process every frame for better responsiveness
    
    // Grid configuration
    this.gridConfig = {
      rows: 6,
      cols: 6,
      cellWidth: 0,
      cellHeight: 0
    };
    
    // Motion tracking with optimized data structures
    this.motionGrid = [];
    this.motionLog = [];
    this.activeCells = new Map(); // Track active motion cells with timestamps
    this.cellTimeouts = new Map(); // Track timeouts for clearing cells
    this.lastGridUpdate = 0;
    this.gridUpdateDelay = 33; // Update grid overlay at ~30fps
    
    // Motion intensity thresholds (adjusted for better detection)
    this.intensityThresholds = {
      low: 0.02,    // 2%
      medium: 0.06, // 6%
      high: 0.12    // 12%
    };
    
    // Auto-pause motion detection when too much movement
    this.motionPauseThreshold = 0.85; // 85% of cells
    this.isMotionPaused = false;
    this.motionPauseTimeout = null;
    this.motionResumeDelay = 2000; // Resume after 2 seconds of low motion
    
    // Performance monitoring
    this.performanceStats = {
      lastFrameTime: 0,
      frameCount: 0,
      avgProcessingTime: 0
    };
    
    // DOM elements
    this.elements = {
      myPeerId: document.getElementById('my-peer-id'),
      remotePeerId: document.getElementById('remote-peer-id'),
      callBtn: document.getElementById('call-btn'),
      endCallBtn: document.getElementById('end-call-btn'),
      copyIdBtn: document.getElementById('copy-id-btn'),
      statusIndicator: document.getElementById('status-indicator'),
      statusText: document.getElementById('status-text'),
      cameraSelect: document.getElementById('camera-select'),
      refreshCamerasBtn: document.getElementById('refresh-cameras-btn'),
      flipHorizontalBtn: document.getElementById('flip-horizontal-btn'),
      flipVerticalBtn: document.getElementById('flip-vertical-btn'),
      rotateBtn: document.getElementById('rotate-btn'),
      motionToggle: document.getElementById('motion-toggle'),
      motionIndicator: document.getElementById('motion-indicator'),
      motionText: document.getElementById('motion-text'),
      localVideo: document.getElementById('local-video'),
      remoteVideo: document.getElementById('remote-video'),
      motionCanvas: document.getElementById('motion-canvas'),
      gridOverlay: document.getElementById('grid-overlay'),
      remoteGridOverlay: document.getElementById('remote-grid-overlay'),
      errorContainer: document.getElementById('error-container'),
      motionLog: document.getElementById('motion-log'),
      clearLogBtn: document.getElementById('clear-log-btn'),
      downloadLogBtn: document.getElementById('download-log-btn')
    };
    
    this.initialize();
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      this.setupEventListeners();
      this.resetMotionDetectionState();
      this.setupMotionDetection();
      await this.initializePeer();
      await this.loadAvailableCameras();
      await this.setupLocalVideo();
      this.updateStatus('ready', 'Ready to connect');
    } catch (error) {
      this.handleError('Initialization failed', error);
    }
  }

  /**
   * Reset motion detection state
   */
  resetMotionDetectionState() {
    this.motionDetectionEnabled = false;
    this.isMotionPaused = false;
    this.previousFrame = null;
    this.activeCells.clear();
    this.motionLog = [];
    this.lastMotionCheck = 0;
    this.lastGridUpdate = 0;
    this.frameSkipCounter = 0;
    
    // Clear motion pause timeout
    if (this.motionPauseTimeout) {
      clearTimeout(this.motionPauseTimeout);
      this.motionPauseTimeout = null;
    }
    
    // Clear animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Clear all cell timeouts
    this.cellTimeouts.forEach(timeout => clearTimeout(timeout));
    this.cellTimeouts.clear();
    
    this.initializeMotionGrid();
    
    // Reset UI elements
    if (this.elements.motionToggle) {
      this.elements.motionToggle.checked = false;
    }
    if (this.elements.motionIndicator) {
      this.elements.motionIndicator.classList.remove('active');
    }
    if (this.elements.motionText) {
      this.elements.motionText.textContent = 'Grid motion detection off';
    }
    
    // Clear all grid overlays
    this.clearAllGridOverlays();
    this.updateMotionLogDisplay();
  }

  /**
   * Clear all grid overlays
   */
  clearAllGridOverlays() {
    if (this.gridOverlayContext) {
      this.gridOverlayContext.clearRect(0, 0, this.gridOverlayCanvas.width, this.gridOverlayCanvas.height);
    }
    if (this.remoteGridOverlayContext) {
      this.remoteGridOverlayContext.clearRect(0, 0, this.remoteGridOverlayCanvas.width, this.remoteGridOverlayCanvas.height);
    }
  }

  /**
   * Initialize motion detection grid
   */
  initializeMotionGrid() {
    this.motionGrid = Array(this.gridConfig.rows).fill().map(() => 
      Array(this.gridConfig.cols).fill().map(() => ({
        motionLevel: 0,
        intensity: 'none',
        lastMotionTime: null,
        isActive: false
      }))
    );
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Connection controls
    this.elements.callBtn.addEventListener('click', () => this.startCall());
    this.elements.endCallBtn.addEventListener('click', () => this.endCall());
    this.elements.copyIdBtn.addEventListener('click', () => this.copyPeerId());
    
    // Camera controls
    this.elements.cameraSelect.addEventListener('change', (e) => this.switchCamera(e.target.value));
    this.elements.refreshCamerasBtn.addEventListener('click', () => this.loadAvailableCameras());
    this.elements.flipHorizontalBtn.addEventListener('click', () => this.toggleFlipHorizontal());
    this.elements.flipVerticalBtn.addEventListener('click', () => this.toggleFlipVertical());
    this.elements.rotateBtn.addEventListener('click', () => this.rotateVideo());
    
    // Motion detection toggle
    this.elements.motionToggle.addEventListener('change', (e) => {
      this.toggleMotionDetection(e.target.checked);
    });
    
    // Motion log controls
    this.elements.clearLogBtn?.addEventListener('click', () => this.clearMotionLog());
    this.elements.downloadLogBtn?.addEventListener('click', () => this.downloadMotionLog());
    
    // Enter key for remote peer ID input
    this.elements.remotePeerId.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !this.elements.callBtn.disabled) {
        this.startCall();
      }
    });

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseMotionDetection();
      } else {
        this.resumeMotionDetection();
      }
    });

    // Handle beforeunload to cleanup resources
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });

    // Handle window resize for video fitting
    window.addEventListener('resize', () => {
      this.handleVideoResize();
    });
  }

  /**
   * Handle video resize to maintain proper fitting
   */
  handleVideoResize() {
    if (this.elements.localVideo.videoWidth > 0) {
      this.updateCanvasDimensions();
    }
  }

  /**
   * Load available cameras
   */
  async loadAvailableCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableCameras = devices.filter(device => device.kind === 'videoinput');
      
      // Update camera dropdown
      this.elements.cameraSelect.innerHTML = '';
      
      if (this.availableCameras.length === 0) {
        this.elements.cameraSelect.innerHTML = '<option value="">No cameras found</option>';
        return;
      }
      
      this.availableCameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.textContent = camera.label || `Camera ${index + 1}`;
        this.elements.cameraSelect.appendChild(option);
      });
      
      // Select the first camera by default
      if (this.availableCameras.length > 0 && !this.currentCameraId) {
        this.currentCameraId = this.availableCameras[0].deviceId;
        this.elements.cameraSelect.value = this.currentCameraId;
      }
      
    } catch (error) {
      console.error('Failed to load cameras:', error);
      this.elements.cameraSelect.innerHTML = '<option value="">Error loading cameras</option>';
    }
  }

  /**
   * Switch to a different camera
   */
  async switchCamera(deviceId) {
    if (!deviceId || deviceId === this.currentCameraId) return;
    
    try {
      this.currentCameraId = deviceId;
      
      // Stop current stream
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }
      
      // Get new stream with selected camera
      await this.setupLocalVideo();
      
      // If in a call, replace the video track
      if (this.call && this.call.peerConnection) {
        const videoTrack = this.localStream.getVideoTracks()[0];
        const sender = this.call.peerConnection.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
      }
      
    } catch (error) {
      this.handleError('Failed to switch camera', error);
    }
  }

  /**
   * Toggle horizontal flip
   */
  toggleFlipHorizontal() {
    this.videoTransforms.flipHorizontal = !this.videoTransforms.flipHorizontal;
    this.applyVideoTransforms();
    this.elements.flipHorizontalBtn.classList.toggle('active', this.videoTransforms.flipHorizontal);
  }

  /**
   * Toggle vertical flip
   */
  toggleFlipVertical() {
    this.videoTransforms.flipVertical = !this.videoTransforms.flipVertical;
    this.applyVideoTransforms();
    this.elements.flipVerticalBtn.classList.toggle('active', this.videoTransforms.flipVertical);
  }

  /**
   * Rotate video by 90 degrees
   */
  rotateVideo() {
    this.videoTransforms.rotation = (this.videoTransforms.rotation + 90) % 360;
    this.applyVideoTransforms();
    
    // Update button to show current rotation
    const rotations = ['0°', '90°', '180°', '270°'];
    const currentRotationIndex = this.videoTransforms.rotation / 90;
    this.elements.rotateBtn.title = `Rotate 90° (Current: ${rotations[currentRotationIndex]})`;
  }

  /**
   * Apply video transformations
   */
  applyVideoTransforms() {
    const { flipHorizontal, flipVertical, rotation } = this.videoTransforms;
    
    let transform = '';
    
    if (flipHorizontal) {
      transform += 'scaleX(-1) ';
    }
    
    if (flipVertical) {
      transform += 'scaleY(-1) ';
    }
    
    if (rotation !== 0) {
      transform += `rotate(${rotation}deg) `;
    }
    
    this.elements.localVideo.style.transform = transform.trim();
    
    // Also apply to grid overlay
    if (this.elements.gridOverlay) {
      this.elements.gridOverlay.style.transform = transform.trim();
    }
  }

  /**
   * Initialize PeerJS connection
   */
  async initializePeer() {
    return new Promise((resolve, reject) => {
      try {
        // Generate a unique peer ID
        const peerId = this.generatePeerId();
        
        // Use the default PeerJS cloud server with better configuration
        this.peer = new Peer(peerId, {
          debug: 2,
          config: {
            'iceServers': [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log('Peer connection opened with ID:', id);
          this.elements.myPeerId.value = id;
          this.updateStatus('connected', 'Connected - Ready to call');
          resolve();
        });

        this.peer.on('call', (call) => {
          console.log('Incoming call from:', call.peer);
          this.handleIncomingCall(call);
        });

        this.peer.on('connection', (conn) => {
          console.log('Data connection established');
          this.setupDataConnection(conn);
        });

        this.peer.on('error', (error) => {
          console.error('Peer error:', error);
          this.handleError('Connection error', error);
          reject(error);
        });

        this.peer.on('disconnected', () => {
          console.log('Peer disconnected, attempting to reconnect...');
          this.updateStatus('disconnected', 'Reconnecting...');
          
          // Attempt to reconnect
          setTimeout(() => {
            if (this.peer && !this.peer.destroyed) {
              this.peer.reconnect();
            }
          }, 1000);
        });

        this.peer.on('close', () => {
          console.log('Peer connection closed');
          this.updateStatus('disconnected', 'Connection closed');
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate a unique peer ID
   */
  generatePeerId() {
    return 'car-' + Math.random().toString(36).substr(2, 4);
  }

  /**
   * Setup local video stream
   */
  async setupLocalVideo() {
    try {
      const constraints = {
        video: { 
          deviceId: this.currentCameraId ? { exact: this.currentCameraId } : undefined,
          width: { ideal: 1280 }, // Higher resolution for better quality
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.elements.localVideo.srcObject = this.localStream;
      console.log('Local video stream initialized');
      
      // Apply current video transformations
      this.applyVideoTransforms();
      
      // Initialize motion detection canvas and grid overlay
      this.setupMotionCanvas();
      this.setupGridOverlay();
      
    } catch (error) {
      this.handleError('Failed to access camera/microphone', error);
      throw error;
    }
  }

  /**
   * Setup motion detection canvas
   */
  setupMotionCanvas() {
    this.motionCanvas = this.elements.motionCanvas;
    this.motionContext = this.motionCanvas.getContext('2d', {
      willReadFrequently: true // Optimize for frequent pixel data reading
    });
    
    // Set canvas size to match video when metadata loads
    this.elements.localVideo.addEventListener('loadedmetadata', () => {
      this.updateCanvasDimensions();
    });

    // Also update on resize
    window.addEventListener('resize', () => {
      if (this.elements.localVideo.videoWidth > 0) {
        this.updateCanvasDimensions();
      }
    });
  }

  /**
   * Update canvas dimensions to match video display size
   */
  updateCanvasDimensions() {
    const video = this.elements.localVideo;
    
    if (!video.videoWidth || !video.videoHeight) return;
    
    // Use smaller canvas for motion detection to improve performance
    const scaleFactor = 0.5; // Process at half resolution
    this.motionCanvas.width = video.videoWidth * scaleFactor;
    this.motionCanvas.height = video.videoHeight * scaleFactor;
    
    // Update grid cell dimensions based on scaled canvas
    this.gridConfig.cellWidth = this.motionCanvas.width / this.gridConfig.cols;
    this.gridConfig.cellHeight = this.motionCanvas.height / this.gridConfig.rows;
    
    // Setup grid overlays with proper dimensions
    this.setupGridOverlayDimensions();
  }

  /**
   * Setup grid overlay canvas
   */
  setupGridOverlay() {
    this.gridOverlayCanvas = this.elements.gridOverlay;
    this.gridOverlayContext = this.gridOverlayCanvas.getContext('2d');
    
    this.remoteGridOverlayCanvas = this.elements.remoteGridOverlay;
    if (this.remoteGridOverlayCanvas) {
      this.remoteGridOverlayContext = this.remoteGridOverlayCanvas.getContext('2d');
    }
  }

  /**
   * Setup grid overlay dimensions
   */
  setupGridOverlayDimensions() {
    const video = this.elements.localVideo;
    if (!video.videoWidth || !video.videoHeight) return;
    
    // Set overlay canvas to match video display size exactly
    if (this.gridOverlayCanvas) {
      this.gridOverlayCanvas.width = video.videoWidth;
      this.gridOverlayCanvas.height = video.videoHeight;
      this.gridOverlayCanvas.style.width = '100%';
      this.gridOverlayCanvas.style.height = '100%';
      this.drawGridLines(this.gridOverlayContext, video.videoWidth, video.videoHeight);
    }
    
    if (this.remoteGridOverlayCanvas) {
      this.remoteGridOverlayCanvas.width = video.videoWidth;
      this.remoteGridOverlayCanvas.height = video.videoHeight;
      this.remoteGridOverlayCanvas.style.width = '100%';
      this.remoteGridOverlayCanvas.style.height = '100%';
      this.drawGridLines(this.remoteGridOverlayContext, video.videoWidth, video.videoHeight);
    }
  }

  /**
   * Draw grid lines only (no text)
   */
  drawGridLines(ctx, canvasWidth, canvasHeight) {
    if (!ctx || !canvasWidth || !canvasHeight) return;
    
    const { rows, cols } = this.gridConfig;
    const cellWidth = canvasWidth / cols;
    const cellHeight = canvasHeight / rows;
    
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Set grid line style
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    
    // Draw vertical lines
    for (let col = 0; col <= cols; col++) {
      const x = col * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }
    
    // Draw horizontal lines
    for (let row = 0; row <= rows; row++) {
      const y = row * cellHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }
  }

  /**
   * Setup motion detection system with optimized performance
   */
  setupMotionDetection() {
    // Use requestAnimationFrame for better performance
    const motionDetectionLoop = () => {
      const now = performance.now();
      
      if (this.motionDetectionEnabled && 
          !this.isMotionPaused &&
          this.elements.localVideo.readyState === 4 && 
          now - this.lastMotionCheck >= this.motionCheckDelay) {
        
        this.checkGridMotion();
        this.lastMotionCheck = now;
      }
      
      if (this.motionDetectionEnabled) {
        this.animationFrameId = requestAnimationFrame(motionDetectionLoop);
      }
    };
    
    // Start the loop when motion detection is enabled
    this.motionDetectionLoop = motionDetectionLoop;
  }

  /**
   * Check for motion in grid cells with optimized processing
   */
  checkGridMotion() {
    if (!this.motionContext || !this.elements.localVideo) return;

    const startTime = performance.now();
    const video = this.elements.localVideo;
    const canvas = this.motionCanvas;
    const ctx = this.motionContext;

    // Draw current frame to canvas at reduced size for performance
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (this.previousFrame) {
      this.analyzeGridMotion(this.previousFrame, currentFrame);
    }

    this.previousFrame = currentFrame;
    
    // Update performance stats
    const processingTime = performance.now() - startTime;
    this.performanceStats.avgProcessingTime = 
      (this.performanceStats.avgProcessingTime + processingTime) / 2;
  }

  /**
   * Analyze motion in each grid cell with optimized algorithm
   */
  analyzeGridMotion(previousFrame, currentFrame) {
    const { rows, cols, cellWidth, cellHeight } = this.gridConfig;
    let hasMotion = false;
    const motionEvents = [];
    const now = Date.now();
    let highMotionCells = 0;
    const totalCells = rows * cols;

    // Process cells in batches for better performance
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const motionLevel = this.calculateCellMotionOptimized(
          previousFrame, 
          currentFrame, 
          col * cellWidth, 
          row * cellHeight, 
          cellWidth, 
          cellHeight
        );

        const cell = this.motionGrid[row][col];
        const cellKey = `${row}-${col}`;
        
        // Update cell motion data
        cell.motionLevel = motionLevel;
        cell.intensity = this.getMotionIntensity(motionLevel);
        
        // Count high motion cells for auto-pause feature
        if (cell.intensity === 'high') {
          highMotionCells++;
        }
        
        if (motionLevel > this.motionThreshold) {
          const coordinate = String.fromCharCode(65 + row) + (col + 1);
          
          // Check if this is a new motion event
          if (!cell.isActive) {
            cell.isActive = true;
            cell.lastMotionTime = now;
            
            // Log motion event
            const motionEvent = {
              coordinate,
              intensity: cell.intensity,
              level: motionLevel,
              timestamp: new Date(now).toISOString(),
              startTime: now
            };
            
            this.motionLog.push(motionEvent);
            motionEvents.push(motionEvent);
            this.updateMotionLogDisplay();
          }
          
          hasMotion = true;
          this.activeCells.set(cellKey, now);
          
          // Clear any existing timeout for this cell
          if (this.cellTimeouts.has(cellKey)) {
            clearTimeout(this.cellTimeouts.get(cellKey));
          }
          
          // Set timeout to clear cell after 200ms of no motion (reduced from 500ms)
          const timeout = setTimeout(() => {
            cell.isActive = false;
            this.activeCells.delete(cellKey);
            this.cellTimeouts.delete(cellKey);
            this.scheduleGridUpdate();
          }, 200);
          
          this.cellTimeouts.set(cellKey, timeout);
        }
      }
    }

    // Check if we need to auto-pause motion detection
    const highMotionPercentage = highMotionCells / totalCells;
    this.checkMotionPause(highMotionPercentage);

    // Schedule grid overlay update
    this.scheduleGridUpdate();
    
    // Send motion data to remote peer (throttled)
    if (hasMotion && this.conn && this.conn.open && now - this.lastDataSend > 100) {
      this.conn.send({
        type: 'grid-motion',
        events: motionEvents,
        gridData: this.motionGrid,
        timestamp: now
      });
      this.lastDataSend = now;
    }
  }

  /**
   * Check if motion detection should be paused due to excessive movement
   */
  checkMotionPause(highMotionPercentage) {
    if (highMotionPercentage >= this.motionPauseThreshold && !this.isMotionPaused) {
      // Pause motion detection
      this.isMotionPaused = true;
      this.elements.motionText.textContent = 'Motion detection paused (too much movement)';
      this.elements.motionIndicator.classList.add('paused');
      
      console.log(`Motion detection paused: ${(highMotionPercentage * 100).toFixed(1)}% high motion cells`);
      
      // Clear existing timeout
      if (this.motionPauseTimeout) {
        clearTimeout(this.motionPauseTimeout);
      }
      
      // Set timeout to resume motion detection
      this.motionPauseTimeout = setTimeout(() => {
        this.resumeMotionFromPause();
      }, this.motionResumeDelay);
      
    } else if (highMotionPercentage < this.motionPauseThreshold * 0.5 && this.isMotionPaused) {
      // If motion drops significantly below threshold, resume immediately
      this.resumeMotionFromPause();
    }
  }

  /**
   * Resume motion detection from auto-pause
   */
  resumeMotionFromPause() {
    if (this.isMotionPaused && this.motionDetectionEnabled) {
      this.isMotionPaused = false;
      this.elements.motionText.textContent = 'Grid motion detection on';
      this.elements.motionIndicator.classList.remove('paused');
      
      // Clear timeout
      if (this.motionPauseTimeout) {
        clearTimeout(this.motionPauseTimeout);
        this.motionPauseTimeout = null;
      }
      
      // Reset motion grid and previous frame
      this.initializeMotionGrid();
      this.previousFrame = null;
      this.clearAllGridOverlays();
      
      console.log('Motion detection resumed');
    }
  }

  /**
   * Optimized motion calculation using sampling
   */
  calculateCellMotionOptimized(frame1, frame2, startX, startY, width, height) {
    const data1 = frame1.data;
    const data2 = frame2.data;
    const canvasWidth = frame1.width;
    let diffCount = 0;
    let totalPixels = 0;
    const threshold = 25; // Reduced threshold for better sensitivity
    
    // Sample every 2nd pixel for performance (can adjust based on needs)
    const sampleRate = 2;
    
    const endX = Math.min(Math.floor(startX + width), canvasWidth);
    const endY = Math.min(Math.floor(startY + height), frame1.height);

    for (let y = Math.floor(startY); y < endY; y += sampleRate) {
      for (let x = Math.floor(startX); x < endX; x += sampleRate) {
        const index = (y * canvasWidth + x) * 4;
        
        // Use luminance for faster comparison
        const lum1 = data1[index] * 0.299 + data1[index + 1] * 0.587 + data1[index + 2] * 0.114;
        const lum2 = data2[index] * 0.299 + data2[index + 1] * 0.587 + data2[index + 2] * 0.114;
        
        if (Math.abs(lum1 - lum2) > threshold) {
          diffCount++;
        }
        totalPixels++;
      }
    }

    return totalPixels > 0 ? diffCount / totalPixels : 0;
  }

  /**
   * Schedule grid overlay update with throttling
   */
  scheduleGridUpdate() {
    const now = performance.now();
    if (now - this.lastGridUpdate >= this.gridUpdateDelay) {
      this.updateGridOverlay();
      this.lastGridUpdate = now;
    }
  }

  /**
   * Get motion intensity level
   */
  getMotionIntensity(motionLevel) {
    if (motionLevel >= this.intensityThresholds.high) return 'high';
    if (motionLevel >= this.intensityThresholds.medium) return 'medium';
    if (motionLevel >= this.intensityThresholds.low) return 'low';
    return 'none';
  }

  /**
   * Update grid overlay with motion indicators
   */
  updateGridOverlay() {
    if (!this.gridOverlayContext) return;
    
    const video = this.elements.localVideo;
    if (!video.videoWidth || !video.videoHeight) return;
    
    this.drawGridLines(this.gridOverlayContext, video.videoWidth, video.videoHeight);
    this.renderMotionOverlay(this.gridOverlayContext, null, video.videoWidth, video.videoHeight);
  }

  /**
   * Update remote grid overlay with received motion data
   */
  updateRemoteGridOverlay(remoteGridData) {
    if (!this.remoteGridOverlayContext) return;
    
    const video = this.elements.localVideo;
    if (!video.videoWidth || !video.videoHeight) return;
    
    this.drawGridLines(this.remoteGridOverlayContext, video.videoWidth, video.videoHeight);
    this.renderMotionOverlay(this.remoteGridOverlayContext, remoteGridData, video.videoWidth, video.videoHeight);
  }

  /**
   * Render motion overlay on grid - COLORS ONLY
   */
  renderMotionOverlay(ctx, gridData = null, canvasWidth, canvasHeight) {
    if (!ctx || !canvasWidth || !canvasHeight) return;
    
    const { rows, cols } = this.gridConfig;
    const cellWidth = canvasWidth / cols;
    const cellHeight = canvasHeight / rows;
    const dataToUse = gridData || this.motionGrid;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = dataToUse[row] && dataToUse[row][col] ? dataToUse[row][col] : { isActive: false, intensity: 'none', motionLevel: 0 };
        
        if (cell.isActive && cell.intensity !== 'none') {
          const x = col * cellWidth;
          const y = row * cellHeight;
          
          // Set overlay color based on intensity - ONLY COLORS
          let overlayColor;
          switch (cell.intensity) {
            case 'high':
              overlayColor = 'rgba(255, 0, 0, 0.6)';
              break;
            case 'medium':
              overlayColor = 'rgba(255, 165, 0, 0.5)';
              break;
            case 'low':
              overlayColor = 'rgba(255, 255, 0, 0.4)';
              break;
            default:
              continue;
          }
          
          // Draw motion overlay - ONLY COLOR FILL
          ctx.fillStyle = overlayColor;
          ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
        }
      }
    }
  }

  /**
   * Update motion log display
   */
  updateMotionLogDisplay() {
    if (!this.elements.motionLog) return;
    
    const logContainer = this.elements.motionLog;
    const recentEvents = this.motionLog.slice(-10); // Show last 10 events
    
    logContainer.innerHTML = recentEvents.map(event => `
      <div class="motion-log-entry ${event.intensity}">
        <span class="log-coordinate">${event.coordinate}</span>
        <span class="log-intensity">${event.intensity}</span>
        <span class="log-level">${(event.level * 100).toFixed(1)}%</span>
        <span class="log-time">${new Date(event.timestamp).toLocaleTimeString()}</span>
      </div>
    `).join('');
  }

  /**
   * Clear motion log
   */
  clearMotionLog() {
    this.motionLog = [];
    this.updateMotionLogDisplay();
  }

  /**
   * Download motion log as JSON
   */
  downloadMotionLog() {
    const dataStr = JSON.stringify(this.motionLog, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `motion-log-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  }

  /**
   * Toggle motion detection
   */
  toggleMotionDetection(enabled) {
    this.motionDetectionEnabled = enabled;
    
    if (enabled) {
      this.elements.motionIndicator.classList.add('active');
      this.elements.motionText.textContent = 'Grid motion detection on';
      this.previousFrame = null; // Reset frame comparison
      this.initializeMotionGrid(); // Reset grid
      this.updateCanvasDimensions(); // Ensure proper alignment
      this.lastMotionCheck = 0;
      this.lastGridUpdate = 0;
      this.lastDataSend = 0;
      this.isMotionPaused = false;
      
      // Clear any existing pause timeout
      if (this.motionPauseTimeout) {
        clearTimeout(this.motionPauseTimeout);
        this.motionPauseTimeout = null;
      }
      
      // Start the optimized motion detection loop
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.motionDetectionLoop();
      
    } else {
      this.elements.motionIndicator.classList.remove('active');
      this.elements.motionText.textContent = 'Grid motion detection off';
      this.isMotionPaused = false;
      
      // Clear pause timeout
      if (this.motionPauseTimeout) {
        clearTimeout(this.motionPauseTimeout);
        this.motionPauseTimeout = null;
      }
      
      // Stop the motion detection loop
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      
      // Clear all timeouts
      this.cellTimeouts.forEach(timeout => clearTimeout(timeout));
      this.cellTimeouts.clear();
      
      // Clear grid overlays
      this.clearAllGridOverlays();
    }

    // Send motion detection status to remote peer
    if (this.conn && this.conn.open) {
      this.conn.send({
        type: 'motion-toggle',
        enabled: enabled
      });
    }
  }

  /**
   * Pause motion detection (when tab is hidden)
   */
  pauseMotionDetection() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Resume motion detection (when tab is visible)
   */
  resumeMotionDetection() {
    if (this.elements.motionToggle.checked && !this.animationFrameId) {
      this.previousFrame = null;
      this.initializeMotionGrid();
      this.motionDetectionLoop();
    }
  }

  /**
   * Start a call to remote peer
   */
  async startCall() {
    const remotePeerId = this.elements.remotePeerId.value.trim();
    
    if (!remotePeerId) {
      this.showError('Please enter a peer ID to call');
      return;
    }

    if (!this.localStream) {
      this.showError('Local video not available');
      return;
    }

    try {
      this.updateStatus('calling', 'Calling...');
      this.elements.callBtn.disabled = true;
      
      // Establish data connection for motion detection first
      this.conn = this.peer.connect(remotePeerId);
      
      // Wait for data connection to open before starting call
      this.conn.on('open', () => {
        console.log('Data connection opened, starting video call...');
        
        // Start video call
        this.call = this.peer.call(remotePeerId, this.localStream);
        this.setupCall(this.call);
      });
      
      this.conn.on('error', (error) => {
        console.error('Data connection error:', error);
        this.handleError('Failed to connect to peer', error);
        this.elements.callBtn.disabled = false;
        this.updateStatus('connected', 'Ready to call');
      });
      
      this.setupDataConnection(this.conn);
      
    } catch (error) {
      this.handleError('Failed to start call', error);
      this.elements.callBtn.disabled = false;
      this.updateStatus('connected', 'Ready to call');
    }
  }

  /**
   * Handle incoming call
   */
  handleIncomingCall(call) {
    // Auto-accept incoming calls for better user experience
    console.log('Auto-accepting incoming call from:', call.peer);
    this.call = call;
    this.call.answer(this.localStream);
    this.setupCall(this.call);
    this.updateStatus('in-call', 'Call connected');
  }

  /**
   * Setup call event handlers
   */
  setupCall(call) {
    call.on('stream', (remoteStream) => {
      console.log('Received remote stream');
      this.remoteStream = remoteStream;
      this.elements.remoteVideo.srcObject = remoteStream;
      this.updateStatus('in-call', 'Call connected');
      this.elements.endCallBtn.disabled = false;
      this.elements.callBtn.disabled = true;
      
      // Hide placeholder
      const placeholder = document.querySelector('.no-video-placeholder');
      if (placeholder) placeholder.style.display = 'none';
      
      // Setup remote video grid overlay when metadata loads
      this.elements.remoteVideo.addEventListener('loadedmetadata', () => {
        this.setupRemoteGridOverlay();
      });
    });

    call.on('close', () => {
      console.log('Call ended');
      this.endCall();
    });

    call.on('error', (error) => {
      console.error('Call error:', error);
      this.handleError('Call error', error);
      this.elements.callBtn.disabled = false;
      this.updateStatus('connected', 'Ready to call');
    });
  }

  /**
   * Setup remote grid overlay
   */
  setupRemoteGridOverlay() {
    if (this.remoteGridOverlayCanvas && this.elements.localVideo.videoWidth > 0) {
      this.remoteGridOverlayCanvas.width = this.elements.localVideo.videoWidth;
      this.remoteGridOverlayCanvas.height = this.elements.localVideo.videoHeight;
      this.remoteGridOverlayCanvas.style.width = '100%';
      this.remoteGridOverlayCanvas.style.height = '100%';
      this.drawGridLines(this.remoteGridOverlayContext, this.elements.localVideo.videoWidth, this.elements.localVideo.videoHeight);
    }
  }

  /**
   * Setup data connection for motion detection
   */
  setupDataConnection(conn) {
    this.lastDataSend = 0; // Initialize data send throttling
    
    conn.on('data', (data) => {
      this.handleDataMessage(data);
    });

    conn.on('close', () => {
      console.log('Data connection closed');
    });

    conn.on('error', (error) => {
      console.error('Data connection error:', error);
    });
  }

  /**
   * Handle incoming data messages
   */
  handleDataMessage(data) {
    switch (data.type) {
      case 'grid-motion':
        this.handleRemoteGridMotion(data);
        break;
      case 'motion-toggle':
        console.log('Remote peer motion detection:', data.enabled ? 'enabled' : 'disabled');
        break;
    }
  }

  /**
   * Handle remote grid motion data
   */
  handleRemoteGridMotion(data) {
    // Update remote grid overlay with received motion data
    if (data.gridData && this.remoteGridOverlayContext) {
      this.updateRemoteGridOverlay(data.gridData);
    }
  }

  /**
   * End the current call
   */
  endCall() {
    if (this.call) {
      this.call.close();
      this.call = null;
    }

    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }

    this.elements.remoteVideo.srcObject = null;
    this.elements.callBtn.disabled = false;
    this.elements.endCallBtn.disabled = true;
    
    // Show placeholder
    const placeholder = document.querySelector('.no-video-placeholder');
    if (placeholder) placeholder.style.display = 'flex';
    
    // Clear remote grid overlay
    if (this.remoteGridOverlayContext) {
      this.remoteGridOverlayContext.clearRect(0, 0, this.remoteGridOverlayCanvas.width, this.remoteGridOverlayCanvas.height);
    }
    
    // Reset motion detection state
    this.resetMotionDetectionState();
    
    this.updateStatus('connected', 'Ready to call');
  }

  /**
   * Copy peer ID to clipboard
   */
  async copyPeerId() {
    try {
      await navigator.clipboard.writeText(this.elements.myPeerId.value);
      
      // Visual feedback
      const originalText = this.elements.copyIdBtn.textContent;
      this.elements.copyIdBtn.textContent = 'Copied!';
      this.elements.copyIdBtn.classList.add('success');
      
      setTimeout(() => {
        this.elements.copyIdBtn.textContent = originalText;
        this.elements.copyIdBtn.classList.remove('success');
      }, 2000);
      
    } catch (error) {
      this.showError('Failed to copy to clipboard');
    }
  }

  /**
   * Update connection status
   */
  updateStatus(status, text) {
    this.elements.statusIndicator.className = `status-dot ${status}`;
    this.elements.statusText.textContent = text;
  }

  /**
   * Handle errors
   */
  handleError(message, error) {
    console.error(message, error);
    
    let errorMessage = message;
    if (error) {
      switch (error.type) {
        case 'peer-unavailable':
          errorMessage = 'Peer not found or unavailable';
          break;
        case 'network':
          errorMessage = 'Network connection failed';
          break;
        case 'server-error':
          errorMessage = 'Server connection failed';
          break;
        default:
          if (error.message) {
            errorMessage += ': ' + error.message;
          }
      }
    }
    
    this.showError(errorMessage);
    this.updateStatus('error', 'Connection error');
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <span class="error-icon">⚠️</span>
      <span class="error-text">${message}</span>
      <button class="error-close">&times;</button>
    `;
    
    this.elements.errorContainer.appendChild(errorDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, 5000);
    
    // Manual close
    errorDiv.querySelector('.error-close').addEventListener('click', () => {
      errorDiv.remove();
    });
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    // Clear motion pause timeout
    if (this.motionPauseTimeout) {
      clearTimeout(this.motionPauseTimeout);
    }
    
    // Clear all cell timeouts
    this.cellTimeouts.forEach(timeout => clearTimeout(timeout));
    this.cellTimeouts.clear();
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.call) {
      this.call.close();
    }
    
    if (this.conn) {
      this.conn.close();
    }
    
    if (this.peer) {
      this.peer.destroy();
    }
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new VideoCallApp();
});