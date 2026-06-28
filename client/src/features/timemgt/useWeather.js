import { useState, useEffect } from "react";

const WMO_LABELS = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Icy fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Slight rain", 63: "Rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Snow", 75: "Heavy snow",
  80: "Slight showers", 81: "Showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Severe thunderstorm",
};

function wmoLabel(code) {
  return WMO_LABELS[code] ?? `Code ${code}`;
}

export function useWeather() {
  const [weather, setWeather] = useState(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function requestLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation not supported by this browser.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setLocation({ lat, lon });
        try {
          const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,wind_speed_10m,weather_code` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max` +
            `&timezone=auto&forecast_days=7`;
          const res = await fetch(url);
          if (!res.ok) throw new Error("Open-Meteo error");
          const data = await res.json();
          const c = data.current;
          setWeather({
            condition: wmoLabel(c.weather_code),
            temperature: c.temperature_2m,
            windSpeed: c.wind_speed_10m,
            weatherCode: c.weather_code,
            unit: data.current_units?.temperature_2m ?? "°C",
            daily: data.daily,
          });
        } catch {
          setError("Could not fetch weather data.");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setError("Location access denied. Enable location to see weather.");
      }
    );
  }

  useEffect(() => { requestLocation(); }, []);

  return { weather, location, loading, error, requestLocation };
}
