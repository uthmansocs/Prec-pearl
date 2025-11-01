import { useState, useEffect } from 'react';

interface ReverseGeocodeResult {
  address: string;
  loading: boolean;
  error: string | null;
}

export const useReverseGeocode = (lat?: number, lng?: number): ReverseGeocodeResult => {
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lat || !lng) {
      setAddress('');
      return;
    }

    const reverseGeocode = async () => {
      setLoading(true);
      setError(null);

      try {
        // Using Nominatim (free alternative to OpenCage)
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
        );

        if (!response.ok) {
          throw new Error('Geocoding service unavailable');
        }

        const data = await response.json();
        
        if (data.display_name) {
          setAddress(data.display_name);
        } else {
          setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } finally {
        setLoading(false);
      }
    };

    reverseGeocode();
  }, [lat, lng]);

  return { address, loading, error };
};