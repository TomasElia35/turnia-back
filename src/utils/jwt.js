import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signToken = (payload) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const verifyToken = (token) => {
  try {
    return { valid: true, payload: jwt.verify(token, env.jwtSecret) };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};
