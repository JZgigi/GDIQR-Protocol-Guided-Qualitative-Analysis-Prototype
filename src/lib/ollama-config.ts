const defaultOllamaBaseUrl = "http://localhost:11434";
const defaultOllamaModel = "qwen3:8b";

export function getOllamaBaseUrl() {
  return (process.env.OLLAMA_BASE_URL || defaultOllamaBaseUrl).replace(/\/$/, "");
}

export function getOllamaOpenAiBaseUrl() {
  const baseUrl = getOllamaBaseUrl();
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

export function getOllamaChatCompletionsUrl() {
  return `${getOllamaOpenAiBaseUrl()}/chat/completions`;
}

export function getOllamaModelsUrl() {
  return `${getOllamaOpenAiBaseUrl()}/models`;
}

export function getOllamaModel() {
  return process.env.OLLAMA_MODEL || defaultOllamaModel;
}

export function getOllamaConnectionErrorMessage() {
  return `Local AI is not reachable at ${getOllamaBaseUrl()}. Start Ollama on the host machine with "ollama serve" and make sure model "${getOllamaModel()}" is installed.`;
}
