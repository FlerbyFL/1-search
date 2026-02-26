export async function parseWithPython(urls: string[]) {
  const resp = await fetch('http://localhost:8000/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  })

  if (!resp.ok) {
    throw new Error(`Python parser request failed: ${resp.status} ${resp.statusText}`)
  }

  const data = await resp.json()
  return data
}

export default parseWithPython
