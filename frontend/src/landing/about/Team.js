import React from 'react';

function Team() {
    return (
        <div className="container">
            <div className="row p-3 mt-5">
                <h1 className="text-center">
                    People
                </h1>
            </div>
            <div className="row p-3">
                <div className="col-6 p-5 text-center">
                    <img src="media/images/nithin-kamath.jpg" alt='Nithin Kamath' className='img-fluid rounded-circle mb-3' style={{ width: "60%" }} />
                    <h4 className='mt-5'>
                        Nithin Kamath
                    </h4>
                    <h6 className='text-muted mb-0 fs-6'>
                        Founder, CEO
                    </h6>
                </div>
                <div className="col-6 p-3">
                    <p>
                        Nithin bootstrapped and founded Zerodha in 2010 to overcome the hurdles he faced during his decade long stint as a trader. Today, Zerodha has changed the landscape of the Indian broking industry.
                    </p>
                    <p>
                        He is a member of the SEBI Secondary Market Advisory Committee (SMAC) and the Market Data Advisory Committee (MDAC).
                    </p>
                    <p>
                        Playing basketball is his zen.
                    </p>
                    <p>
                        Connect on <a href='#'>Homepage</a> / <a href='#'>TradingQnA</a> / <a href='#'>Twitter</a>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Team;