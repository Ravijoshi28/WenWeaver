import axios, {
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

const AxiosInstance = axios.create({
 baseURL: "/api",
   withCredentials: true,
});

AxiosInstance.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const status = error.response?.status;

    if (
      (status === 401 || status === 402) &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        // Refresh access token
        await axios.post(
          "http://localhost:3000/api/auth/refresh",
          {},
          {
            withCredentials: true,
          }
        );

        // Retry original request
        return AxiosInstance(originalRequest);
      } catch (refreshError) {
        // Refresh failed -> logout
        await axios.post(
          "http://localhost:3000/api/auth/logout",
          {},
          {
            withCredentials: true,
          }
        );

        window.location.href = "/auth/login";

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default AxiosInstance;