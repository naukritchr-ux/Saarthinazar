const API_URL = "http://127.0.0.1:8000";

export async function loginUser(
  username: string,
  password: string
) {

  const response = await fetch(
    `${API_URL}/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    }
  );

  return response.json();
}