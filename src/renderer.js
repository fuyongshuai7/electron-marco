import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import './index.css';
import './styles/ui.css';

createApp(App).use(i18n).mount('#app');
