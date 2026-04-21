const YANDEX_CLIENT_ID = '0adb6f415ae54469be4720085042a879';
const YANDEX_AUTH_URL = 'https://oauth.yandex.ru/authorize';
const YANDEX_API = 'https://cloud-api.yandex.net/v1/disk';
const APP_FOLDER = 'HANQYZY_hub';

export function getYandexToken() {
  return localStorage.getItem('yandex_token');
}

export function setYandexToken(token) {
  localStorage.setItem('yandex_token', token);
}

export function startYandexAuth() {
  const redirectUri = window.location.origin;
  const url = `${YANDEX_AUTH_URL}?response_type=token&client_id=${YANDEX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}

export function checkYandexAuthCallback() {
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    const params = new URLSearchParams(hash.substring(1));
    const token = params.get('access_token');
    if (token) {
      setYandexToken(token);
      // Clean URL
      history.replaceState(null, '', window.location.pathname);
      return token;
    }
  }
  return null;
}

async function rawFetch(method, url, token, options = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `OAuth ${token}`, ...(options.headers || {}) },
    ...options,
  });
  return res;
}

async function createFolder(folderPath, token) {
  const url = `${YANDEX_API}/resources?path=${encodeURIComponent(folderPath)}`;
  const res = await rawFetch('PUT', url, token);
  // 201 = created, 409 = already exists — both OK
  if (res.status === 201 || res.status === 409) return true;
  return false;
}

async function ensureAllFolders(subFolder, token) {
  // Create root app folder
  await createFolder(APP_FOLDER, token);
  
  if (!subFolder) return;
  
  // Create nested folders one by one
  const parts = subFolder.split('/').filter(Boolean);
  let current = APP_FOLDER;
  for (const part of parts) {
    current = current + '/' + part;
    await createFolder(current, token);
  }
}

export async function uploadFile(file, subFolder = '') {
  const token = getYandexToken();
  if (!token) throw new Error('Not authorized');
  
  // Ensure folders exist
  await ensureAllFolders(subFolder, token);
  
  const folder = subFolder ? `${APP_FOLDER}/${subFolder}` : APP_FOLDER;
  const filePath = `${folder}/${file.name}`;
  
  // Step 1: Get upload URL
  const uploadUrlRes = await rawFetch(
    'GET',
    `${YANDEX_API}/resources/upload?path=${encodeURIComponent(filePath)}&overwrite=true`,
    token
  );
  
  if (!uploadUrlRes.ok) {
    const errText = await uploadUrlRes.text();
    console.error('Get upload URL failed:', uploadUrlRes.status, errText);
    throw new Error(`Не удалось получить URL для загрузки (${uploadUrlRes.status})`);
  }
  
  const uploadData = await uploadUrlRes.json();
  
  if (!uploadData.href) {
    console.error('No href in response:', uploadData);
    throw new Error('Яндекс Диск не вернул URL для загрузки');
  }
  
  // Step 2: Upload the file directly to the href
  const putRes = await fetch(uploadData.href, {
    method: 'PUT',
    body: file,
  });
  
  if (!putRes.ok) {
    console.error('File upload failed:', putRes.status);
    throw new Error(`Загрузка файла не удалась (${putRes.status})`);
  }
  
  // Step 3: Try to publish (make public link)
  let publicUrl = '';
  try {
    const pubRes = await rawFetch(
      'PUT',
      `${YANDEX_API}/resources/publish?path=${encodeURIComponent(filePath)}`,
      token
    );
    
    if (pubRes.ok) {
      // Get file info with public URL
      const infoRes = await rawFetch(
        'GET',
        `${YANDEX_API}/resources?path=${encodeURIComponent(filePath)}`,
        token
      );
      if (infoRes.ok) {
        const info = await infoRes.json();
        publicUrl = info.public_url || '';
      }
    }
  } catch (e) {
    // Publishing is optional, ignore errors
    console.warn('Could not publish file:', e);
  }
  
  return {
    name: file.name,
    size: formatSize(file.size),
    path: filePath,
    publicUrl,
  };
}

export async function listFiles(subFolder = '') {
  const token = getYandexToken();
  if (!token) return [];
  
  const folder = subFolder ? `${APP_FOLDER}/${subFolder}` : APP_FOLDER;
  try {
    const res = await rawFetch(
      'GET',
      `${YANDEX_API}/resources?path=${encodeURIComponent(folder)}&limit=100`,
      token
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data._embedded?.items || []).filter(i => i.type === 'file').map(i => ({
      name: i.name,
      size: formatSize(i.size),
      path: i.path,
      publicUrl: i.public_url || '',
      modified: i.modified?.slice(0, 10) || '',
    }));
  } catch (e) {
    return [];
  }
}

export async function deleteFile(filePath) {
  const token = getYandexToken();
  if (!token) return;
  await rawFetch(
    'DELETE',
    `${YANDEX_API}/resources?path=${encodeURIComponent(filePath)}&permanently=false`,
    token
  );
}

export async function getDownloadLink(filePath) {
  const token = getYandexToken();
  if (!token) throw new Error('Not authorized');
  const res = await rawFetch(
    'GET',
    `${YANDEX_API}/resources/download?path=${encodeURIComponent(filePath)}`,
    token
  );
  if (!res.ok) throw new Error('Could not get download link');
  const data = await res.json();
  return data.href;
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
