import { atom } from 'jotai';
import type { AuthUser } from '@/services/authService';

// Example atom: Global counter or user preferences
export const counterAtom = atom(0);

export const accessTokenAtom = atom<string | null>(null);
export const currentUserAtom = atom<AuthUser | null>(null);
export const authInitializedAtom = atom(false);
