import * as authService from '../services/auth.service.js';

export async function registerHandler(req, res, next) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req, res, next) {
  try {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function googleLoginHandler(req, res, next) {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }
    const result = await authService.loginWithGoogle(idToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
