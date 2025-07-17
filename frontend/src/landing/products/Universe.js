import React from 'react';

function Universe() {
    return (
        <div className='container text-center p-5 mt-5 mb-5'>
            <div className='row'>
                <p>Want to know more about our technology stack? Check out the <a href='#'>Zerodha.tech</a> blog.</p>
            </div>
            <div className='row mt-5'>
                <h3>The Zerodha Universe</h3>
                <p className='fs-6 ' style={{ fontSize: "0.5rem" }}>Extend your trading and investment experience even further with our partner platforms</p>
            </div>
            <div className='row mt-2 d-flex justify-content-center'>
                <img src='media/images/universe.png' alt='Zerodha Universe' className='img-fluid' style={{ width: "60%" }} />
            </div>
            <div className='row mt-5'>
                <button className='p-3 btn btn-primary fs-6' style={{ width: "15%", margin: "0 auto" }}>Sign up for free</button>
            </div>
        </div>
    );
}

export default Universe;