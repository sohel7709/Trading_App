import React from 'react';
import { Link } from 'react-router-dom'; // Assuming you are using React Router

function NotFound() {
    return (
        <div className='container text-center py-5'>
            <div className='row justify-content-center mb-4'>
                <div className='col-md-8'>
                    <h1 className='display-1 fw-bold'>404</h1>
                    <h2 className='mb-3'>Page Not Found</h2>
                    <p className='lead'>
                        Oops! It looks like the page you were looking for doesn't exist.
                        Perhaps you mistyped the address or the page has moved.
                    </p>
                    <hr className='my-4' />
                    <p>Here are some helpful links instead:</p>
                    <div className='d-grid gap-2 col-6 mx-auto'>
                        <Link to="/" className='btn btn-primary btn-lg'>Go to Homepage</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default NotFound;