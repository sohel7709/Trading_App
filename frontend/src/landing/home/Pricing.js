import React from 'react';

function Pricing() {
    return (
        <div className='container mb-5 p-5'>
            <div className='row'>
                <div className='col-4'>
                    <h1>Unbeatable pricing</h1>
                    <p>We pioneered the concept of discount broking and price transparency in India. Flat fees and no hidden charges.</p>
                    <a href='#' className='mx-2 link-offset-2 link-underline link-underline-opacity-0 text-primary'>See pricing </a><i class="fa-solid fa-arrow-right text-primary"></i>
                </div>
                <div className='col-8 d-flex flex-row align-items-center'>
                    {/* <img src='media/images/pricing-eq.svg' alt='Pricing Image' className='img-fluid' style={{ width: "50%" }} />
                    <p style={{ fontsize: "10px" }} >Free account<br />opening</p>
                    <img src='media/images/pricing-eq.svg' alt='Pricing Image' className='img-fluid' style={{ width: "50%" }} />
                    <p style={{ fontsize: "10px" }} > Free equity delivery<br />and direct mutual funds</p>
                    <img src='media/images/other-trades.svg' alt='Pricing Image' className='img-fluid' style={{ width: "50%" }} />
                    <p style={{ fontsize: "10px" }} > Intraday and<br />F&O</p> */}
                    <img src='media/images/pricing.png' alt='Pricing Image' className='img-fluid' style={{ width: "100%" }} />
                </div>
            </div>
        </div >
    );
}

export default Pricing;