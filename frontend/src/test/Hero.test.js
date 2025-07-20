import React from 'react';
import { render, screen } from '@testing-library/react';

import Hero from '../landing/home/Hero';

//Test Suite
describe('Hero Component', () => {
    // Test Case 1
    test('Renders Hero Image', () => {
        render(<Hero />);
        const heroImage = screen.getByAltText('Landing Image');
        expect(heroImage).toBeInTheDocument();
        expect(heroImage).toHaveAttribute('src', expect.stringContaining('landing.png'));
    });
})