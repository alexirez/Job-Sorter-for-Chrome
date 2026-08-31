import { mount } from 'svelte';
import Postings from './Postings.svelte';

const app = mount(Postings, {
  target: document.getElementById('app'),
});

export default app;