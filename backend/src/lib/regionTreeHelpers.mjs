export function normalizeRegionChildren(children) {
  return [...children]
    .sort((left, right) => {
      if (right.averageDistanceKm !== left.averageDistanceKm) {
        return right.averageDistanceKm - left.averageDistanceKm;
      }

      if (right.totalDistanceKm !== left.totalDistanceKm) {
        return right.totalDistanceKm - left.totalDistanceKm;
      }

      if (right.participants !== left.participants) {
        return right.participants - left.participants;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .map((child, index) => ({
      ...child,
      rank: index + 1,
    }));
}

export function findRegionPathForUser(node, user) {
  const provinceName = typeof user.provinceName === 'string' ? user.provinceName.trim() : '';
  const cityName = typeof user.cityName === 'string' ? user.cityName.trim() : '';
  const districtName = typeof user.districtName === 'string' ? user.districtName.trim() : '';

  if (!provinceName) {
    return [node];
  }

  const provinceNode = (node.children ?? []).find((entry) => entry.name === provinceName);

  if (!provinceNode) {
    return [node];
  }

  const path = [node, provinceNode];
  let currentNode = provinceNode;

  if (cityName) {
    const cityNode = (currentNode.children ?? []).find((entry) => entry.name === cityName);

    if (cityNode) {
      path.push(cityNode);
      currentNode = cityNode;
    }
  }

  if (districtName && currentNode.children?.length) {
    const districtNode = currentNode.children.find((entry) => entry.name === districtName);

    if (districtNode) {
      path.push(districtNode);
    }
  }

  return path;
}

export function findRegionPath(node, targetId) {
  if (node.id === targetId) {
    return [node];
  }

  for (const child of node.children ?? []) {
    const childPath = findRegionPath(child, targetId);

    if (childPath) {
      return [node, ...childPath];
    }
  }

  return null;
}
