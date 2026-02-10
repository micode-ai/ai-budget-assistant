import 'reflect-metadata';

export const AI_FEATURE_TYPE_KEY = 'aiFeatureType';
export const AI_COST_UNITS_KEY = 'aiCostUnits';

export function TrackAiUsage(featureType: string, costUnits: number) {
  return (target: object, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(AI_FEATURE_TYPE_KEY, featureType, descriptor.value);
    Reflect.defineMetadata(AI_COST_UNITS_KEY, costUnits, descriptor.value);
    return descriptor;
  };
}
