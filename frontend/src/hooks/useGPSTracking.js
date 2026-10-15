import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * GPS Tracking Hook - Real GPS location tracking for technicians
 * Uses browser Geolocation API with proper error handling and permissions
 */
export const useGPSTracking = (options = {}) => {
  const {
    enableHighAccuracy = true,
    timeout = 30000,
    maximumAge = 10000,
    updateInterval = 10000, // Update every 10 seconds
    onLocationUpdate = null,
    autoStart = false
  } = options;

  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [watching, setWatching] = useState(false);
  const [permission, setPermission] = useState('unknown'); // 'granted', 'denied', 'unknown'
  const watchIdRef = useRef(null);

  // Check geolocation permission
  const checkPermission = useCallback(async () => {
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermission(result.state);
        result.addEventListener('change', () => setPermission(result.state));
      } catch (err) {
        console.warn('Permission API not supported');
      }
    }
  }, []);

  // Get current position once
  const getCurrentPosition = useCallback(() => {
    const readPosition = (positionOptions) => new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp
          };

          setLocation(loc);
          resolve(loc);
        },
        reject,
        positionOptions
      );
    });

    return (async () => {
      if (typeof window !== 'undefined'
        && !window.isSecureContext
        && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        const secureError = new Error('Phone GPS requires the deployed HTTPS site.');
        secureError.code = 'INSECURE_CONTEXT';
        setError(secureError);
        throw secureError;
      }

      setLoading(true);
      setError(null);

      try {
        const location = await readPosition({ enableHighAccuracy, timeout, maximumAge: 0 });
        setPermission('granted');
        return location;
      } catch (firstError) {
        if (firstError.code === 1) {
          setPermission('denied');
          const deniedError = new Error('GPS access is blocked. Enable Location for this browser in phone settings, then try again.');
          deniedError.code = firstError.code;
          setError(deniedError);
          throw deniedError;
        }

        try {
          const location = await readPosition({
            enableHighAccuracy: false,
            timeout: Math.max(timeout, 30000),
            maximumAge: 60000
          });
          setPermission('granted');
          return location;
        } catch (fallbackError) {
          const errorMessage = fallbackError.code === 3
            ? 'GPS is taking too long. Move near a window, turn on Precise Location, and try again.'
            : 'GPS position is unavailable. Turn on phone Location and allow this browser to use it.';
          const gpsError = new Error(errorMessage);
          gpsError.code = fallbackError.code;
          setError(gpsError);
          throw gpsError;
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [enableHighAccuracy, timeout, maximumAge]);

  // Start watching position
  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setError(new Error('Geolocation is not supported by this browser'));
      return;
    }

    if (watchIdRef.current !== null) return; // Already watching

    setWatching(true);
    setLoading(true);
    setError(null);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp
        };

        setLocation(loc);
        setPermission('granted');
        setLoading(false);

        // Call callback if provided
        if (onLocationUpdate) {
          onLocationUpdate(loc);
        }
      },
      (err) => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }

        let errorMessage = 'GPS tracking error';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'GPS access denied';
            setPermission('denied');
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'GPS position is unavailable. Keep Location on, then tap Allow GPS to retry.';
            break;
          case err.TIMEOUT:
            errorMessage = 'The phone did not return a location yet. Keep this page open and tap Allow GPS to retry.';
            break;
        }

        const gpsError = new Error(errorMessage);
        gpsError.code = err.code;
        setError(gpsError);
        setLoading(false);
        setWatching(false);
      },
      {
        enableHighAccuracy,
        timeout: Math.max(timeout, 60000),
        maximumAge: Math.min(maximumAge, 60000)
      }
    );

    watchIdRef.current = watchId;
  }, [enableHighAccuracy, timeout, maximumAge, onLocationUpdate]);

  // Stop watching
  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatching(false);
  }, []);

  // Request permission (triggers browser permission prompt)
  const requestPermission = useCallback(async () => {
    try {
      await getCurrentPosition();
      setPermission('granted');
    } catch (err) {
      if (err.code === 1) {
        setPermission('denied');
      }
      throw err;
    }
  }, [getCurrentPosition]);

  // Initialize
  useEffect(() => {
    checkPermission();

    if (autoStart) {
      startWatching();
    }

    // Properly clear the geolocation watcher on unmount to prevent memory/battery leaks
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setWatching(false);
    };
  }, [checkPermission, autoStart]);

  return {
    location,
    error,
    loading,
    watching,
    permission,
    getCurrentPosition,
    startWatching,
    stopWatching,
    requestPermission
  };
};
