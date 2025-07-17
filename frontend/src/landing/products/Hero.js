import React from 'react';

function Hero() {
    return (
        <div className='container text-center p-5 mt-5 mb-5 border-bottom'>
            <h1 className=' mb-3' style={{ color: "#424242" }}>Zerodha Products</h1>
            <p className='fs-6 mb-3 text-muted'>Sleek, modern, and intuitive trading platforms</p>
            <p>Check out our <a href='#'>investment offerings →</a></p>
        </div>
    );
}

export default Hero;