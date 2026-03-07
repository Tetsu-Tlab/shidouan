/**
 * ANTIGRAVITY API Key Bridge
 * Nova Lab Pro からAPIキーを受け取るブリッジフック。
 */
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'geminiApiKey';

export function useApiKeyBridge() {
    const [apiKey, setApiKey] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const urlKey = params.get('apiKey');
        if (urlKey) {
            localStorage.setItem(STORAGE_KEY, urlKey);
            return urlKey;
        }
        const legacy = localStorage.getItem('gemini_api_key');
        if (legacy) {
            localStorage.setItem(STORAGE_KEY, legacy);
            return legacy;
        }
        return localStorage.getItem(STORAGE_KEY) || '';
    });

    useEffect(() => {
        const handleMessage = (event) => {
            const { type, apiKey: key } = event.data || {};
            if ((type === 'ANTIGRAVITY_SYNC' || type === 'ANTIGRAVITY_API_KEY') && key) {
                setApiKey(key);
                localStorage.setItem(STORAGE_KEY, key);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const saveApiKey = (key) => {
        setApiKey(key);
        localStorage.setItem(STORAGE_KEY, key);
    };

    return { apiKey, saveApiKey };
}
