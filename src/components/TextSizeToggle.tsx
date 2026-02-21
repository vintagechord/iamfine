'use client';

import { useEffect, useState } from 'react';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

type TextScaleMode = 'normal' | 'large';

const TEXT_SCALE_STORAGE_KEY = 'iamfine:text-scale:v1';
const LARGE_TEXT_CLASS = 'ui-text-large';
const USER_METADATA_NAMESPACE = 'iamfine';
const UI_PREFERENCES_KEY = 'uiPreferences';

function normalizeTextScaleMode(raw: unknown): TextScaleMode | null {
    if (raw === 'normal' || raw === 'large') {
        return raw;
    }
    return null;
}

function applyTextScale(mode: TextScaleMode) {
    const root = document.documentElement;
    if (mode === 'large') {
        root.classList.add(LARGE_TEXT_CLASS);
    } else {
        root.classList.remove(LARGE_TEXT_CLASS);
    }
}

function readStoredTextScaleMode() {
    try {
        const stored = localStorage.getItem(TEXT_SCALE_STORAGE_KEY);
        return normalizeTextScaleMode(stored) ?? 'normal';
    } catch {
        return 'normal' as TextScaleMode;
    }
}

function persistTextScaleMode(mode: TextScaleMode) {
    try {
        localStorage.setItem(TEXT_SCALE_STORAGE_KEY, mode);
    } catch {
        // Ignore storage quota/privacy mode errors.
    }
}

function readMetadataTextScaleMode(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }

    const root = raw as Record<string, unknown>;
    const namespaced = root[USER_METADATA_NAMESPACE];
    if (!namespaced || typeof namespaced !== 'object' || Array.isArray(namespaced)) {
        return null;
    }

    const scoped = namespaced as Record<string, unknown>;
    const preferences = scoped[UI_PREFERENCES_KEY];
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
        return null;
    }

    const preferenceRecord = preferences as Record<string, unknown>;
    return normalizeTextScaleMode(preferenceRecord.textScale);
}

function buildUpdatedUserMetadata(raw: unknown, textScale: TextScaleMode) {
    const root =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};

    const namespacedRaw = root[USER_METADATA_NAMESPACE];
    const namespaced =
        namespacedRaw && typeof namespacedRaw === 'object' && !Array.isArray(namespacedRaw)
            ? { ...(namespacedRaw as Record<string, unknown>) }
            : {};

    const preferencesRaw = namespaced[UI_PREFERENCES_KEY];
    const preferences =
        preferencesRaw && typeof preferencesRaw === 'object' && !Array.isArray(preferencesRaw)
            ? { ...(preferencesRaw as Record<string, unknown>) }
            : {};

    preferences.textScale = textScale;
    namespaced[UI_PREFERENCES_KEY] = preferences;
    root[USER_METADATA_NAMESPACE] = namespaced;

    return root;
}

export default function TextSizeToggle() {
    const [mode, setMode] = useState<TextScaleMode>('normal');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let canceled = false;
        const localMode = readStoredTextScaleMode();

        applyTextScale(localMode);
        const initialModeTimer = window.setTimeout(() => {
            setMode(localMode);
        }, 0);

        const syncInitialModeFromAccount = async () => {
            if (!hasSupabaseEnv || !supabase) {
                return;
            }

            const { user, error } = await getAuthSessionUser();
            if (canceled || error || !user) {
                return;
            }

            const metadataMode = readMetadataTextScaleMode(user.user_metadata);
            const resolvedMode = metadataMode ?? localMode;

            if (!canceled) {
                setMode(resolvedMode);
                applyTextScale(resolvedMode);
                persistTextScaleMode(resolvedMode);
            }

            if (!metadataMode) {
                const updatedMetadata = buildUpdatedUserMetadata(user.user_metadata, resolvedMode);
                const { error: updateError } = await supabase.auth.updateUser({
                    data: updatedMetadata,
                });
                if (updateError) {
                    console.error('글자 크기 설정 초기 동기화 실패', updateError);
                }
            }
        };

        void syncInitialModeFromAccount();

        return () => {
            canceled = true;
            window.clearTimeout(initialModeTimer);
        };
    }, []);

    const toggleTextScale = async () => {
        const nextMode: TextScaleMode = mode === 'large' ? 'normal' : 'large';

        setMode(nextMode);
        applyTextScale(nextMode);
        persistTextScaleMode(nextMode);

        if (!hasSupabaseEnv || !supabase) {
            return;
        }

        setSaving(true);
        const { user, error } = await getAuthSessionUser();
        if (error || !user) {
            setSaving(false);
            return;
        }

        const updatedMetadata = buildUpdatedUserMetadata(user.user_metadata, nextMode);
        const { error: updateError } = await supabase.auth.updateUser({
            data: updatedMetadata,
        });

        setSaving(false);

        if (updateError) {
            console.error('글자 크기 설정 저장 실패', updateError);
        }
    };

    return (
        <button
            type="button"
            className="whitespace-nowrap rounded-full border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 sm:px-3 sm:text-sm"
            onClick={toggleTextScale}
            aria-label={mode === 'large' ? '글자 크기를 기본으로 변경' : '글자 크기를 크게 변경'}
            disabled={saving}
        >
            <span suppressHydrationWarning>{mode === 'large' ? '글자-' : '글자+'}</span>
        </button>
    );
}
