const { SuccessResponse, ErrorResponse, InternalError } = require('../utils/ApiResponse');

const responseHandler = (req, res, next) => {
    // Attach helper methods to res
    res.success = (data, message) => {
        const response = new SuccessResponse(data, message);
        return res.status(response.statusCode).json(response);
    };

    res.error = (error) => {
        if (error instanceof ErrorResponse) {
            return res.status(error.statusCode).json(error);
        }
        // Handle native Error objects
        console.error("Unexpected Error:", error);
        const response = new InternalError(error.message || 'Something went wrong');
        return res.status(response.statusCode).json(response);
    };

    next();
};

module.exports = responseHandler;
