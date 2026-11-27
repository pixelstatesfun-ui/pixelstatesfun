/*
 * Input validation helpers for faction creation and editing
 */

import { t } from 'ttag';

export function validateFactionName(name) {
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return t`Name must be at least 2 characters long.`;
  }
  if (name.trim().length > 32) {
    return t`Name cannot be longer than 32 characters.`;
  }
  if (!/^[a-zA-Z0-9_\-\s]+$/.test(name.trim())) {
    return t`Name contains invalid characters.`;
  }
  return null;
}

export function validateFactionTag(tag) {
  if (!tag || typeof tag !== 'string' || tag.trim().length < 2) {
    return t`Tag must be at least 2 characters long.`;
  }
  if (tag.trim().length > 6) {
    return t`Tag cannot be longer than 6 characters.`;
  }
  return null;
}

export function validateFactionTitle(title) {
  if (!title || typeof title !== 'string' || title.trim().length < 2) {
    return t`Title must be at least 2 characters long.`;
  }
  if (title.trim().length > 48) {
    return t`Title cannot be longer than 48 characters.`;
  }
  return null;
}

export function validateDescription(description) {
  if (description && String(description).length > 500) {
    return t`Description cannot be longer than 500 characters.`;
  }
  return null;
}
