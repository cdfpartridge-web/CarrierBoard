import { render, screen } from '@testing-library/react';
import App from './App';

test('shows Riftbound ladder headline', () => {
  render(<App />);
  const heading = screen.getByText(/Host lobbies, match quickly, and track Elo/i);
  expect(heading).toBeInTheDocument();
});
