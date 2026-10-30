// Vercel serverless function for the Command Center API (/api/command/*). The logic is in server/command/.
import { commandCenterRequestListener } from '../../server/command/http.mjs';

const listener = commandCenterRequestListener();

export default function handler(req, res) {
  return listener(req, res);
}
