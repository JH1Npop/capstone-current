import { api, getApiErrorMessage } from './core';

export const fetchPublicLandingSettings = async () => {
  try {
    const { data } = await api.get('/public/landing-page/');
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load landing page settings.'));
  }
};
