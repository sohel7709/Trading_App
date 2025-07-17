import React from 'react';

function Hero() {
    return (
        <div className='container mt-5'>
            <div className='row mt-5 mb-5 text-center'>
                <h1>Charges</h1>
                <p className='text-muted'>List of all charges and taxes</p>
            </div>
            <div className='row mt-5 mb-5 text-center'>
                <div className='col mb-5 d-flex flex-column align-items-center'>
                    <img src='media/images/pricing-eq.svg' alt='Pricing' className='img-fluid' style={{ width: "30%" }} />
                    <h4>Free equity delivery</h4>
                    <p className='text-muted'>All equity delivery investments (NSE, BSE), are absolutely free — ₹ 0 brokerage.</p>
                </div>
                <div className='col'>
                    <img src='media/images/other-trades.svg' alt='Pricing' className='img-fluid' style={{ width: "30%" }} />
                    <h4>Free equity delivery</h4>
                    <p className='text-muted'>All equity delivery investments (NSE, BSE), are absolutely free — ₹ 0 brokerage.</p>
                </div>
                <div className='col'>
                    <img src='media/images/pricing-eq.svg' alt='Pricing' className='img-fluid' style={{ width: "30%" }} />
                    <h4>Free equity delivery</h4>
                    <p className='text-muted'>All equity delivery investments (NSE, BSE), are absolutely free — ₹ 0 brokerage.</p>
                </div>
            </div>
        </div>
    );
}

export default Hero;