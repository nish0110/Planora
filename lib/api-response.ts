export async function assertSuccessfulJsonResponse(response: Response, fallback: string): Promise<void> {
  const responseText = await response.text();
  if (!responseText.trim()) {
    throw new Error(`The server returned an empty response (HTTP ${response.status}). Check the server terminal for errors.`);
  }

  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status}). Check the server terminal for errors.`);
  }

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `${fallback} (HTTP ${response.status}).`;
    throw new Error(message);
  }
}
