/*
 * Input validation helpers for faction creation and editing
 */

import { t } from 'ttag';

// eslint-disable-next-line no-useless-escape, max-len
const mailTester = /^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;
const azTester = /^[a-zA-Z][a-zA-Z0-9._-]+$/;

export function validateEMail(email) {
  if (!email) return t`Email can't be empty.`;
  if (email.length < 5) return t`Email should be at least 5 characters long.`;
  if (email.length > 40) return t`Email can't be longer than 40 characters.`;
  if (email.indexOf('.') === -1) return t`Email should at least contain a dot`;
  const posAt = email.indexOf('@');
  if (posAt === -1 || posAt === 0 || posAt === email.length - 1) {
    return t`Email should contain a @`;
  }
  if (!mailTester.test(email)) return 'Your Email looks shady';
  return false;
}

export function validateName(name) {
  if (!name) return t`Name can't be empty.`;
  if (name.length < 2) return t`Name must be at least 2 characters long`;
  if (name.length > 26) return t`Name must be shorter than 26 characters`;
  if (name.indexOf('@') !== -1
    || name.indexOf('/') !== -1
    || name.indexOf('\\') !== -1
    || name.indexOf('>') !== -1
    || name.indexOf('<') !== -1
    || name.indexOf('#') !== -1
    || name.indexOf(String.fromCharCode(27)) !== -1
  ) {
    return t`Name contains invalid character like @, /, \\ or #`;
  }
  return false;
}

export function validateUsername(username) {
  if (!username) return t`Username can't be empty.`;
  if (username.length < 2) {
    return t`Username must be at least 2 characters long`;
  }
  if (username.length > 26) {
    return t`Username must be shorter than 26 characters`;
  }
  if (!azTester.test(username)) {
    return t`Username can only contain the characters: a-z . _ and -`;
  }
  return false;
}

export function validatePasswordCompareReturn(returnCode) {
  switch (returnCode) {
    case 0:
      return null;
    case 1:
      return t`This user has not password set`;
    case 2:
      // eslint-disable-next-line max-len
      return t`This email / password combination got hacked and leaked. To protect this account, the password has been reset. Please use the "Forgot my password" function on the LogIn page to set a new password. In the future, consider not installing malware, Thank You.`;
    case 3:
      return t`Incorrect password`;
    default:
      return t`Server Error`;
  }
}

export function sanitizeName(name) {
  return name.substring(0, 25).replace(/@/g, 'at');
}

export function validatePassword(password) {
  if (!password) return t`No password given.`;
  if (password.length < 6) {
    return t`Password must be at least 6 characters long.`;
  }
  if (password.length > 60) {
    return t`Password must be shorter than 60 characters.`;
  }
  return false;
}

export function validateCoorRange(ulcoor, brcoor, canvasSize) {
  if (!ulcoor || !brcoor) {
    return 'Not all coordinates defined';
  }

  let splitCoords = ulcoor.trim().split('_');
  if (splitCoords.length !== 2) {
    return 'Invalid Coordinate Format for top-left corner';
  }
  const [x, y] = splitCoords.map((z) => Math.floor(Number(z)));
  splitCoords = brcoor.trim().split('_');
  if (splitCoords.length !== 2) {
    return 'Invalid Coordinate Format for bottom-right corner';
  }
  const [u, v] = splitCoords.map((z) => Math.floor(Number(z)));

  let error = null;
  if (Number.isNaN(x)) {
    error = 'x of top-left corner is not a valid number';
  } else if (Number.isNaN(y)) {
    error = 'y of top-left corner is not a valid number';
  } else if (Number.isNaN(u)) {
    error = 'x of bottom-right corner is not a valid number';
  } else if (Number.isNaN(v)) {
    error = 'y of bottom-right corner is not a valid number';
  } else if (u < x || v < y) {
    error = 'Corner coordinates are aligned wrong';
  }
  if (error !== null) {
    return error;
  }

  const canvasMaxXY = canvasSize / 2;
  const canvasMinXY = -canvasMaxXY;
  if (x < canvasMinXY || y < canvasMinXY
    || x >= canvasMaxXY || y >= canvasMaxXY
  ) {
    return 'Coordinates of top-left corner are outside of canvas';
  }
  if (u < canvasMinXY || v < canvasMinXY
    || u >= canvasMaxXY || v >= canvasMaxXY
  ) {
    return 'Coordinates of bottom-right corner are outside of canvas';
  }

  return [x, y, u, v];
}

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
