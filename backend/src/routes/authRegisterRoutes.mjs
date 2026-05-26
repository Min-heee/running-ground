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
  const universityName = typeof body.universityName === 'string' ? body.universityName.trim() : '';
  const addressDetail = validateRequiredString(body.addressDetail, '상세 주소를 입력해주세요.');
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해주세요.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

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
    universityName,
    addressDetail,
  });

  sendJson(response, 201, result);
}
