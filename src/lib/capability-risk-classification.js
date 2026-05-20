import classification from '../../governance/CAPABILITY_RISK_CLASSIFICATION_V1.json' with { type: 'json' };

export const CAPABILITY_RISK_CLASSIFICATION_V1 = Object.freeze(classification);

const CLASSIFICATIONS = Object.freeze(CAPABILITY_RISK_CLASSIFICATION_V1.classifications || {});

export const CAPABILITY_RISK_CLASSES = Object.freeze(Object.keys(CLASSIFICATIONS));

export function validateRiskClass(riskClass) {
  if (typeof riskClass !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(CLASSIFICATIONS, riskClass)) return null;
  return riskClass;
}

export function getRiskClassProfile(riskClass) {
  const validRiskClass = validateRiskClass(riskClass);
  if (!validRiskClass) return null;
  return Object.freeze({
    risk_class: validRiskClass,
    ...CLASSIFICATIONS[validRiskClass]
  });
}
