import { Game } from '@bornengine/engine';
import '../../tests/game-runtime/lifecycle-integration';

if (Game.name.length === 0) throw new Error('BornEngine Game class was not loaded.');
