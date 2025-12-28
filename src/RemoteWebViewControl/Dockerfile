# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY ["RemoteWebViewControl.csproj", "./"]
RUN dotnet restore "RemoteWebViewControl.csproj"

# Copy all source files and build
COPY . .
RUN dotnet build "RemoteWebViewControl.csproj" -c Release -o /app/build

# Publish stage
FROM build AS publish
RUN dotnet publish "RemoteWebViewControl.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Set environment variables
ENV ASPNETCORE_URLS=http://+:80
ENV ASPNETCORE_ENVIRONMENT=Production

# Expose port 80
EXPOSE 80

# Copy published files
COPY --from=publish /app/publish .

# Set entry point
ENTRYPOINT ["dotnet", "RemoteWebViewControl.dll"]
