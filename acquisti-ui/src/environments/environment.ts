export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080',        // backend Spring
  jwt: {
    accessLeewaySec: 10,                      // margen de seguridad para exp
    refreshEndpoint: '/auth/refresh',
    loginEndpoint:   '/auth/login'
  }
};
