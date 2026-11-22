import './ui/styles.css';
import { startApp } from './app';
import { showAudioDiag } from './ui/audioDiag';

startApp(document.getElementById('app')!);
// …/kuku-farm/?diag opens a sound check for this device
if (new URLSearchParams(location.search).has('diag')) showAudioDiag();
