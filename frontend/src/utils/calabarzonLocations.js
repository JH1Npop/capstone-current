const PSGC_API_BASE = 'https://psgc.cloud/api/v2';

// Official ten-digit PSGC province codes for Region IV-A (CALABARZON).
// Keeping these locally means the first dropdown never relies on the external
// hierarchy service.
export const CALABARZON_PROVINCES = [
  { code: '0401000000', name: 'Batangas' },
  { code: '0402100000', name: 'Cavite' },
  { code: '0403400000', name: 'Laguna' },
  { code: '0405600000', name: 'Quezon' },
  { code: '0405800000', name: 'Rizal' },
];

// Lucena is a highly urbanized city in CALABARZON and is administratively
// independent from Quezon, so province-scoped PSGC responses can omit it. The
// portal groups it under Quezon for the existing service-area experience.
const LUCENA = { code: '0431200000', name: 'City of Lucena' };

const normalizeCollection = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const fetchCollection = async (path, signal) => {
  const response = await fetch(`${PSGC_API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Location service returned ${response.status}.`);
  }

  return normalizeCollection(await response.json())
    .map((row) => ({
      code: String(row?.code || '').trim(),
      name: String(row?.name || '').trim(),
    }))
    .filter((row) => row.code && row.name)
    .sort((left, right) => left.name.localeCompare(right.name, 'en-PH'));
};

export const fetchCitiesMunicipalities = async (provinceCode, signal) => {
  const places = await fetchCollection(
    `/provinces/${encodeURIComponent(provinceCode)}/cities-municipalities`,
    signal,
  );

  if (provinceCode === '0405600000' && !places.some((place) => place.code === LUCENA.code)) {
    return [...places, LUCENA].sort((left, right) => left.name.localeCompare(right.name, 'en-PH'));
  }

  return places;
};

export const fetchBarangays = (cityMunicipalityCode, signal) =>
  fetchCollection(
    `/cities-municipalities/${encodeURIComponent(cityMunicipalityCode)}/barangays`,
    signal,
  );
