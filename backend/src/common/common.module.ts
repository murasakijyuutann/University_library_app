import { Global, Module } from '@nestjs/common';
import { StateTransitionValidator } from './statemachine/state-transition.validator';

// Global module (mirrors PrismaModule) exporting StateTransitionValidator —
// every domain service that owns a state machine injects the same instance
// rather than each module re-providing it.
@Global()
@Module({
  providers: [StateTransitionValidator],
  exports: [StateTransitionValidator],
})
export class CommonModule {}
