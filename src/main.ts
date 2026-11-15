import './ui/styles.css';
import { createNewState } from './core/state';
import { createLayout } from './ui/layout';
import { createPanel } from './ui/panel';

const state = createNewState(Date.now());
const layout = createLayout(document.getElementById('app')!, state);
const panel = createPanel(layout.panel);
panel.onModeChange(m => panel.showIdle(m, m === 'basic' ? '點一列開始' : '準備好了就開始！'));
panel.showIdle('basic', '點一列開始');
