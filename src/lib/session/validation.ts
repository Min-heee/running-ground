export const USERNAME_RULE_DESCRIPTION = '아이디는 4~20자의 영문 소문자, 숫자, -, _만 사용할 수 있어요.';
export const PASSWORD_RULE_DESCRIPTION = '비밀번호는 8자 이상이고 영문과 숫자를 모두 포함해야 해요.';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{3,19}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function getUsernameValidationError(value: string) {
  const username = normalizeUsername(value);

  if (!username) {
    return '아이디를 입력해주세요.';
  }

  if (!USERNAME_PATTERN.test(username)) {
    return USERNAME_RULE_DESCRIPTION;
  }

  return null;
}

export function getPasswordValidationError(value: string) {
  if (!value) {
    return '비밀번호를 입력해주세요.';
  }

  if (value.length < 8) {
    return '비밀번호는 8자 이상으로 입력해주세요.';
  }

  if (/\s/.test(value)) {
    return '비밀번호에는 공백을 넣을 수 없어요.';
  }

  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return '비밀번호에는 영문과 숫자를 모두 포함해주세요.';
  }

  return null;
}
