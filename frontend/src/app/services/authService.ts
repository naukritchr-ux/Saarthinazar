const API_URL = "http://127.0.0.1:8000";

// =====================================================
// LOGIN
// =====================================================

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

  const data = await response.json();

  // =====================================================
  // STORE TOKEN
  // =====================================================

  if (data?.access_token) {

    localStorage.setItem(
      "token",
      data.access_token
    );
  }

  return data;
}

// =====================================================
// AUTH HEADERS
// =====================================================

export function authHeaders() {

  const token = localStorage.getItem(
    "token"
  );

  return {

    "Content-Type": "application/json",

    Authorization: `Bearer ${token}`,
  };
}