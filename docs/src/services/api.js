// Define the backend URL based on environment
const BASE_URL = import.meta.env.PROD
  ? 'https://volunteering-app-109370863016.europe-west1.run.app' // Live Cloud Backend
  : ''; // In development, keep empty to use Vite Proxy

export const fetchFromApi = async (path, options = {}) => {
  try {
    // Construct the full URL: BASE_URL + path
    // e.g. https://volunteering.../api/names
    const url = `${BASE_URL}${path}`;

    const res = await fetch(url, options);
    
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    
    return options.expectJson !== false ? res.json() : res.text();
  } catch (err) {
    console.error(`API Error for ${path}:`, err);
    throw err;
  }
};