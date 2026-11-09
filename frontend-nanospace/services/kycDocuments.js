const DATABASE_NAME = 'nanospace-kyc-documents';
const STORE_NAME = 'documents';
const DATABASE_VERSION = 1;

function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Document storage is unavailable in this browser.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open document storage.'));
  });
}

export async function getKycDocuments() {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result.sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)));
      request.onerror = () => reject(request.error || new Error('Could not read KYC documents.'));
      transaction.onabort = () => reject(transaction.error || new Error('Could not read KYC documents.'));
    });
  } finally {
    database.close();
  }
}

export async function saveKycDocument(document) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).add(document);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save the document.'));
      transaction.onabort = () => reject(transaction.error || new Error('Could not save the document.'));
    });
  } finally {
    database.close();
  }
}

export async function deleteKycDocument(id) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not delete the document.'));
      transaction.onabort = () => reject(transaction.error || new Error('Could not delete the document.'));
    });
  } finally {
    database.close();
  }
}

export async function updateKycDocumentStatus(id, status, reviewer) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      let updatedDocument;
      request.onsuccess = () => {
        if (!request.result) {
          transaction.abort();
          reject(new Error('This KYC document no longer exists.'));
          return;
        }
        updatedDocument = {
          ...request.result,
          status,
          reviewedAt: new Date().toISOString(),
          reviewedBy: reviewer,
        };
        store.put(updatedDocument);
      };
      request.onerror = () => reject(request.error || new Error('Could not find the KYC document.'));
      transaction.oncomplete = () => resolve(updatedDocument);
      transaction.onerror = () => reject(transaction.error || new Error('Could not update document status.'));
      transaction.onabort = () => reject(transaction.error || new Error('Could not update document status.'));
    });
  } finally {
    database.close();
  }
}
