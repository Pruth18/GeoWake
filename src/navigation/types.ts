import type { StackScreenProps } from '@react-navigation/stack';

import type { Destination } from '../types';

export type RootStackParamList = {
  Home: undefined;
  Map: undefined;
  /** Carries the destination to monitor. Phase 3 also reaches this from a notification tap. */
  Alarm: { destination: Destination };
  Settings: undefined;
  /** Development and internal builds only — see app.config.ts extra.enableDevTools. */
  Debug: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = StackScreenProps<
  RootStackParamList,
  T
>;

/**
 * Makes useNavigation() typed everywhere without each caller passing a generic.
 * See https://reactnavigation.org/docs/typescript/#specifying-default-types-for-usenavigation
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
