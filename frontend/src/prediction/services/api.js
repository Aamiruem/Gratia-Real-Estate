import { apiRequest } from "../../services/apiClient";

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const getPredictionOptions = () => apiRequest("/predictions/options");
export const getPredictionMetrics = () => apiRequest("/predictions/metrics");
export const getFeatureImportance = () => apiRequest("/predictions/feature-importance");
export const predictPrice = (data) => apiRequest("/predictions", json("POST", data));
