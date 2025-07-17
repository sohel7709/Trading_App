import React from 'react';

function Education() {
    return (
        <div className='container mb-5 p-5'>
            <div className='row'>
                <div className='col-6 d-flex flex-column justify-content-center'>
                    <img src='media/images/index-education.svg' alt='Education Image' className='img-fluid' style={{ width: "90%" }} />
                </div>
                <div className='col-6'>
                    <h1 className='mb-5'>Free and open market education</h1>
                    <p>Varsity, the largest online stock market education book in the world covering everything from the basics to advanced trading.</p>
                    <a href='#' className='mx-2 link-offset-2 link-underline link-underline-opacity-0 text-primary'>Varsity</a><i class="fa-solid fa-arrow-right text-primary"></i>
                    <p className='mt-5'>TradingQ&A, the most active trading and investment community in India for all your market related queries.</p>
                    <a href='#' className='mx-2 link-offset-2 link-underline link-underline-opacity-0 text-primary'>TradingQ&A</a><i class="fa-solid fa-arrow-right text-primary"></i>
                </div>
            </div>
        </div >
    );
}

export default Education;