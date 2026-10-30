// Vercel serverless function for the Command Center API. vercel.json rewrites /api/command/* here (?p=<route>).
import { commandCenterRequestListener } from '../server/command/http.mjs';

const listener = commandCenterRequestListener();

export default function handler(req, res) {
  return listener(req, res);
}
