import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import type { AddressRegionNode } from '@/features/location/addressCatalog';
import { buildRegionSelectionState } from '@/features/location/RegionSelection';
import { fetchRegionCatalog, getApiErrorMessage } from '@/services';
import {
  checkUsernameAvailability,
  getPasswordValidationError,
  getUsernameValidationError,
  normalizeUsername,
  registerAccount,
} from '@/lib/session';
import { formatBirthDateInput, formatPhoneInput } from '@/features/auth/utils/signupFormatters';

type UsernameCheckState = {
  status: 'idle' | 'checking' | 'available' | 'unavailable' | 'error';
  message: string | null;
  checkedUsername: string;
};

export type DisplayNamePreference = 'nickname' | 'realName';

export function useSignupForm() {
  const [nickname, setNickname] = useState('');
  const [realName, setRealName] = useState('');
  const [displayNamePreference, setDisplayNamePreference] = useState<DisplayNamePreference>('nickname');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [phone, setPhone] = useState('');
  const [provinceName, setProvinceName] = useState('');
  const [secondaryRegionName, setSecondaryRegionName] = useState('');
  const [tertiaryRegionName, setTertiaryRegionName] = useState('');
  const [regions, setRegions] = useState<AddressRegionNode[]>([]);
  const [addressDetail, setAddressDetail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [openRegionStep, setOpenRegionStep] = useState<'province' | 'secondary' | 'tertiary' | 'detail'>('province');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheckState>({
    status: 'idle',
    message: null,
    checkedUsername: '',
  });

  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const usernameValidationMessage = useMemo(() => (username ? getUsernameValidationError(username) : null), [username]);
  const passwordValidationMessage = useMemo(() => (password ? getPasswordValidationError(password) : null), [password]);
  const passwordConfirmMessage = useMemo(() => {
    if (!passwordConfirm) {
      return null;
    }

    return password === passwordConfirm ? null : '비밀번호가 서로 달라요.';
  }, [password, passwordConfirm]);
  const passwordReady = Boolean(password && passwordConfirm && !passwordValidationMessage && !passwordConfirmMessage);
  const publicDisplayName = useMemo(
    () => (displayNamePreference === 'realName' ? realName.trim() : nickname.trim()),
    [displayNamePreference, nickname, realName],
  );

  useEffect(() => {
    fetchRegionCatalog()
      .then((regionCatalog) => {
        setRegions(regionCatalog.regions);
      })
      .catch((loadError) => {
        setCatalogError(getApiErrorMessage(loadError, '회원가입에 필요한 목록을 불러오지 못했어요.'));
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  const selection = useMemo(
    () => buildRegionSelectionState(regions, provinceName, secondaryRegionName, tertiaryRegionName),
    [regions, provinceName, secondaryRegionName, tertiaryRegionName],
  );
  const {
    selectedProvince,
    secondaryOptions,
    selectedSecondary,
    tertiaryOptions,
    finalRegion,
    finalCityName,
    finalDistrictName,
    selectedAddressLabel,
  } = selection;
  const checkingUsername = usernameCheck.status === 'checking';
  const usernameReady = usernameCheck.status === 'available' && usernameCheck.checkedUsername === normalizedUsername;
  const normalizedPhone = useMemo(() => phone.replace(/\D/g, ''), [phone]);
  const requiredProfileReady = Boolean(
    publicDisplayName
    && realName.trim()
    && normalizedUsername
    && !usernameValidationMessage
    && normalizedPhone.length >= 10
    && selectedAddressLabel
    && addressDetail.trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim()),
  );
  const signupReady = requiredProfileReady && usernameReady && passwordReady;

  useEffect(() => {
    if (!selectedProvince) {
      setOpenRegionStep('province');
      return;
    }

    if (!selectedSecondary) {
      setOpenRegionStep('secondary');
      return;
    }

    if (tertiaryOptions.length > 0 && !finalRegion) {
      setOpenRegionStep('tertiary');
      return;
    }

    setOpenRegionStep('detail');
  }, [finalRegion, selectedProvince, selectedSecondary, tertiaryOptions.length]);

  const handleUsernameChange = (value: string) => {
    const nextUsername = value.trim().toLowerCase();
    setUsername(nextUsername);
    setError(null);

    const nextNormalizedUsername = normalizeUsername(nextUsername);

    setUsernameCheck((currentState) => (
      currentState.checkedUsername === nextNormalizedUsername
        ? currentState
        : {
            status: 'idle',
            message: null,
            checkedUsername: '',
          }
    ));
  };

  const handlePhoneChange = (nextValue: string) => {
    setPhone(formatPhoneInput(nextValue));
  };

  const handleBirthDateChange = (nextValue: string) => {
    setBirthDate(formatBirthDateInput(nextValue));
  };

  const handleSelectProvince = (nextProvince: AddressRegionNode) => {
    setProvinceName(nextProvince.name);
    setSecondaryRegionName('');
    setTertiaryRegionName('');
    setAddressDetail('');
    setOpenRegionStep('secondary');
  };

  const handleSelectSecondary = (nextSecondary: AddressRegionNode) => {
    setSecondaryRegionName(nextSecondary.name);
    setTertiaryRegionName('');
    setAddressDetail('');
    setOpenRegionStep(nextSecondary.children?.length ? 'tertiary' : 'detail');
  };

  const handleSelectTertiary = (nextTertiary: AddressRegionNode) => {
    setTertiaryRegionName(nextTertiary.name);
    setAddressDetail('');
    setOpenRegionStep('detail');
  };

  const handleCheckUsername = async () => {
    const usernameValidationError = getUsernameValidationError(normalizedUsername);

    if (usernameValidationError) {
      setUsernameCheck({
        status: 'error',
        message: usernameValidationError,
        checkedUsername: '',
      });
      return false;
    }

    setUsernameCheck({
      status: 'checking',
      message: '아이디를 확인하고 있어요.',
      checkedUsername: normalizedUsername,
    });

    try {
      const result = await checkUsernameAvailability(normalizedUsername);

      setUsernameCheck({
        status: result.available ? 'available' : 'unavailable',
        message: result.message,
        checkedUsername: result.username,
      });

      return result.available;
    } catch (usernameError) {
      setUsernameCheck({
        status: 'error',
        message: getApiErrorMessage(usernameError, '아이디 중복 확인에 실패했어요.'),
        checkedUsername: normalizedUsername,
      });
      return false;
    }
  };

  const handleSignup = async () => {
    setError(null);
    setSubmitting(true);

    try {
      const passwordError = getPasswordValidationError(password);

      if (passwordError) {
        throw new Error(passwordError);
      }

      if (password !== passwordConfirm) {
        throw new Error('비밀번호 확인이 일치하지 않아요.');
      }

      const hasAvailableUsername = usernameCheck.status === 'available' && usernameCheck.checkedUsername === normalizedUsername;

      if (!hasAvailableUsername) {
        const available = await handleCheckUsername();

        if (!available) {
          throw new Error('사용 가능한 아이디인지 먼저 확인해주세요.');
        }
      }

      await registerAccount({
        nickname,
        realName,
        displayNamePreference,
        username,
        password,
        phone,
        provinceName,
        cityName: finalCityName,
        districtName: finalDistrictName,
        addressDetail,
        birthDate,
      });
      router.replace('/(tabs)/home');
    } catch (signupError) {
      const message = getApiErrorMessage(signupError, '회원가입에 실패했어요.');

      if (message.includes('이미 사용 중인 아이디')) {
        setUsernameCheck({
          status: 'unavailable',
          message,
          checkedUsername: normalizedUsername,
        });
      }

      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    addressDetail,
    birthDate,
    catalogError,
    catalogLoading,
    checkingUsername,
    displayNamePreference,
    error,
    finalRegion,
    handleBirthDateChange,
    handleCheckUsername,
    handlePhoneChange,
    handleSelectProvince,
    handleSelectSecondary,
    handleSelectTertiary,
    handleSignup,
    handleUsernameChange,
    nickname,
    normalizedPhone,
    openRegionStep,
    password,
    passwordConfirm,
    passwordConfirmMessage,
    passwordReady,
    passwordValidationMessage,
    passwordVisible,
    phone,
    provinceName,
    publicDisplayName,
    realName,
    regions,
    requiredProfileReady,
    secondaryOptions,
    secondaryRegionName,
    selectedAddressLabel,
    selectedProvince,
    selectedSecondary,
    setAddressDetail,
    setDisplayNamePreference,
    setNickname,
    setOpenRegionStep,
    setPassword,
    setPasswordConfirm,
    setPasswordVisible,
    setRealName,
    signupReady,
    submitting,
    tertiaryOptions,
    tertiaryRegionName,
    username,
    usernameCheck,
    usernameReady,
    usernameValidationMessage,
  };
}
