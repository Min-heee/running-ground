export async function routeAuthRegisterRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  getAuthRepository,
  resolveRegionSelection,
  validateNewPassword,
  validateRequiredString,
  validateUsername,
  parseJsonBody,
  ApiError,
}) {
  if (pathname === '/api/auth/register' && method === 'POST') {
    await handleRegister({
      ApiError,
      getAuthRepository,
      parseJsonBody,
      request,
      resolveRegionSelection,
      response,
      sendJson,
      validateNewPassword,
      validateRequiredString,
      validateUsername,
    });
    return true;
  }

  return false;
}

async function handleRegister({
  ApiError,
  getAuthRepository,
  parseJsonBody,
  request,
  resolveRegionSelection,
  response,
  sendJson,
  validateNewPassword,
  validateRequiredString,
  validateUsername,
}) {
  const body = await parseJsonBody(request);
  const username = validateUsername(body.username);
  const password = validateNewPassword(body.password);
  const name = typeof body.nickname === 'string' && body.nickname.trim()
    ? body.nickname.trim()
    : validateRequiredString(body.name, '닉네임을 입력해주세요.');
  const realName = typeof body.realName === 'string' && body.realName.trim()
    ? body.realName.trim()
    : validateRequiredString(body.name, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  const region = resolveRegionSelection(body.provinceName, body.cityName, body.districtName);
  // Apple 5.1.1(v): 상세주소·생년월일은 더 이상 가입에 필수가 아니다. 클라이언트가 보내지
  // 않으면 ''로 저장해 기존 DB 컬럼 shape는 그대로 유지한다(레거시 유저 값 보존).
  const addressDetail = typeof body.addressDetail === 'string' ? body.addressDetail.trim() : '';
  const birthDate = typeof body.birthDate === 'string' ? body.birthDate.trim() : '';
  const phoneVerificationToken = validateRequiredString(
    body.phoneVerificationToken,
    '휴대폰 인증을 먼저 완료해주세요.',
  );

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  const result = await getAuthRepository().register({
    username,
    password,
    name,
    realName,
    phone,
    birthDate,
    region,
    addressDetail,
    phoneVerificationToken,
  });

  sendJson(response, 201, result);
}
