import { z } from "zod";
import { config } from "../config.js";
import { defineTool } from "./types.js";

// Open-Meteo: gratuito e sem chave de API.
const WEATHER_CODES: Record<number, string> = {
  0: "céu limpo", 1: "predominantemente limpo", 2: "parcialmente nublado", 3: "nublado",
  45: "neblina", 48: "neblina com geada", 51: "garoa fraca", 53: "garoa", 55: "garoa forte",
  61: "chuva fraca", 63: "chuva", 65: "chuva forte", 71: "neve fraca", 73: "neve", 75: "neve forte",
  80: "pancadas de chuva", 81: "pancadas de chuva fortes", 82: "temporal", 95: "trovoadas",
  96: "trovoadas com granizo", 99: "trovoadas fortes com granizo",
};

export const getWeather = defineTool({
  name: "get_weather",
  description: "Clima atual e previsão de hoje e amanhã para uma cidade. Sem cidade, usa a cidade padrão do usuário.",
  schema: z.object({ city: z.string().optional().describe("Nome da cidade, ex.: Recife") }),
  run: async ({ city }) => {
    const name = city ?? config.city;
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt`,
    ).then((r) => r.json() as Promise<{ results?: { latitude: number; longitude: number; name: string; country: string }[] }>);
    const place = geo.results?.[0];
    if (!place) return { error: `Cidade não encontrada: ${name}` };

    const params = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
      forecast_days: "2",
      timezone: "auto",
    });
    const data = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`).then((r) => r.json() as Promise<any>);
    const describe = (code: number) => WEATHER_CODES[code] ?? `código ${code}`;
    return {
      place: `${place.name}, ${place.country}`,
      now: {
        temperature: data.current.temperature_2m,
        feelsLike: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        wind: data.current.wind_speed_10m,
        condition: describe(data.current.weather_code),
      },
      days: data.daily.time.map((day: string, i: number) => ({
        day,
        min: data.daily.temperature_2m_min[i],
        max: data.daily.temperature_2m_max[i],
        rainChance: data.daily.precipitation_probability_max[i],
        condition: describe(data.daily.weather_code[i]),
      })),
    };
  },
});
